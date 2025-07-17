import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import { AirbyteLogger } from 'faros-airbyte-cdk';
import { VError } from 'verror';

import { Office365Calendar, Office365CalendarConfig } from '../src/office365calendar';
import { createAxiosError, createRateLimitError, createServerError, createNotFoundError } from './utils/axios-helpers';

// Mock axios for testing
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock Microsoft Graph SDK modules to prevent real API calls
jest.mock('@azure/msal-node');
jest.mock('@azure/identity');
jest.mock('@microsoft/microsoft-graph-client');

describe('O365CAL-003: Error Handling and Retry Logic (TDD)', () => {
  let mockLogger: AirbyteLogger;
  let validConfig: Office365CalendarConfig;
  let office365Calendar: Office365Calendar;
  let mockHttpClient: jest.Mocked<AxiosInstance>;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset singleton between tests
    (Office365Calendar as any).office365Calendar = null;
    
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      fatal: jest.fn(),
      trace: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as unknown as AirbyteLogger;
    
    validConfig = {
      client_id: 'test-client-id',
      client_secret: 'test-client-secret',
      tenant_id: 'test-tenant-id'
    };

    // Setup successful authentication for API tests
    mockedAxios.post.mockResolvedValue({
      data: { access_token: 'test-token' }
    } as AxiosResponse);
    
    mockHttpClient = {
      get: jest.fn(),
    } as unknown as jest.Mocked<AxiosInstance>;
    
    mockedAxios.create.mockReturnValue(mockHttpClient);
    office365Calendar = await Office365Calendar.instance(validConfig, mockLogger);
  });

  describe('Rate Limiting and Retry Logic', () => {
    test('should retry on 429 rate limit responses with exponential backoff', async () => {
      const rateLimitError = createRateLimitError('2');

      const successResponse = {
        data: { value: [{ id: 'calendar-1', name: 'Test Calendar' }] }
      } as AxiosResponse;

      // Mock: First call fails with 429, second call succeeds
      mockHttpClient.get
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(successResponse);

      // Mock setTimeout for testing retry delay
      jest.useFakeTimers();
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      const calendarsPromise = (async () => {
        const calendars = [];
        for await (const calendar of office365Calendar.getCalendars()) {
          calendars.push(calendar);
        }
        return calendars;
      })();

      // Fast-forward through the retry delay
      jest.advanceTimersByTime(2000);
      
      const calendars = await calendarsPromise;
      
      expect(calendars).toHaveLength(1);
      expect(mockHttpClient.get).toHaveBeenCalledTimes(2);
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);
      
      jest.useRealTimers();
      setTimeoutSpy.mockRestore();
    });

    test('should implement exponential backoff for multiple retries', async () => {
      const rateLimitError = {
        response: {
          status: 429,
          data: { error: { message: 'Too Many Requests' } }
        }
      } as AxiosError;

      const successResponse = {
        data: { value: [] }
      } as AxiosResponse;

      // Mock: Multiple 429 errors, then success
      mockHttpClient.get
        .mockRejectedValueOnce(rateLimitError)
        .mockRejectedValueOnce(rateLimitError)
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(successResponse);

      jest.useFakeTimers();
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      const calendarsPromise = (async () => {
        const calendars = [];
        for await (const calendar of office365Calendar.getCalendars()) {
          calendars.push(calendar);
        }
        return calendars;
      })();

      // Fast-forward through multiple retry delays with exponential backoff
      jest.advanceTimersByTime(1000); // First retry: 1s
      jest.advanceTimersByTime(2000); // Second retry: 2s  
      jest.advanceTimersByTime(4000); // Third retry: 4s
      
      await calendarsPromise;
      
      expect(mockHttpClient.get).toHaveBeenCalledTimes(4);
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1000);
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 4000);
      
      jest.useRealTimers();
      setTimeoutSpy.mockRestore();
    });

    test('should respect retry-after header when provided', async () => {
      const rateLimitError = createRateLimitError('5');

      const successResponse = {
        data: { value: [] }
      } as AxiosResponse;

      mockHttpClient.get
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(successResponse);

      jest.useFakeTimers();
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      const calendarsPromise = (async () => {
        const calendars = [];
        for await (const calendar of office365Calendar.getCalendars()) {
          calendars.push(calendar);
        }
        return calendars;
      })();

      jest.advanceTimersByTime(5000); // Respect the retry-after header
      
      await calendarsPromise;
      
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5000);
      
      jest.useRealTimers();
      setTimeoutSpy.mockRestore();
    });

    test('should fail after maximum retry attempts', async () => {
      const rateLimitError = {
        response: {
          status: 429,
          data: { error: { message: 'Too Many Requests' } }
        }
      } as AxiosError;

      // Mock: Always return 429 (never succeeds)
      mockHttpClient.get.mockRejectedValue(rateLimitError);

      jest.useFakeTimers();

      const calendarsPromise = (async () => {
        const calendars = [];
        for await (const calendar of office365Calendar.getCalendars()) {
          calendars.push(calendar);
        }
        return calendars;
      })();

      // Fast-forward through all retry attempts (default: 3 retries)
      for (let i = 0; i < 4; i++) {
        jest.advanceTimersByTime(Math.pow(2, i) * 1000);
      }
      
      await expect(calendarsPromise).rejects.toThrow(VError);
      await expect(calendarsPromise).rejects.toThrow('Rate limit exceeded');
      
      expect(mockHttpClient.get).toHaveBeenCalledTimes(4); // Initial + 3 retries
      
      jest.useRealTimers();
    });
  });

  describe('Microsoft Graph API Error Handling', () => {
    test('should handle and map Graph API error responses', async () => {
      const graphApiError = {
        response: {
          status: 400,
          data: {
            error: {
              code: 'BadRequest',
              message: 'Invalid request syntax',
              innerError: {
                'request-id': 'test-request-id',
                date: '2024-01-01T10:00:00.000Z'
              }
            }
          }
        }
      } as AxiosError;

      mockHttpClient.get.mockRejectedValueOnce(graphApiError);

      const calendarsPromise = (async () => {
        const calendars = [];
        for await (const calendar of office365Calendar.getCalendars()) {
          calendars.push(calendar);
        }
        return calendars;
      })();

      await expect(calendarsPromise).rejects.toThrow(VError);
      await expect(calendarsPromise).rejects.toThrow('BadRequest: Invalid request syntax');
      
      // Should log the request ID for debugging
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('request-id: test-request-id'),
        expect.any(String)
      );
    });

    test('should handle 403 Forbidden errors with helpful messages', async () => {
      const forbiddenError = {
        response: {
          status: 403,
          data: {
            error: {
              code: 'Forbidden',
              message: 'Insufficient privileges to complete the operation'
            }
          }
        }
      } as AxiosError;

      mockHttpClient.get.mockRejectedValueOnce(forbiddenError);

      await expect(office365Calendar.checkConnection())
        .rejects.toThrow(VError);
      await expect(office365Calendar.checkConnection())
        .rejects.toThrow('Insufficient privileges');
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Check that your application has the required Calendar.Read permissions'),
        expect.any(String)
      );
    });

    test('should handle 404 Not Found errors for specific resources', async () => {
      const notFoundError = {
        response: {
          status: 404,
          data: {
            error: {
              code: 'ItemNotFound',
              message: 'The specified calendar could not be found'
            }
          }
        }
      } as AxiosError;

      mockHttpClient.get.mockRejectedValueOnce(notFoundError);

      const eventsPromise = (async () => {
        const events = [];
        for await (const event of office365Calendar.getEvents('nonexistent-calendar')) {
          events.push(event);
        }
        return events;
      })();

      await expect(eventsPromise).rejects.toThrow(VError);
      await expect(eventsPromise).rejects.toThrow('Calendar not found');
    });

    test('should handle 401 Unauthorized errors with token refresh suggestion', async () => {
      const unauthorizedError = {
        response: {
          status: 401,
          data: {
            error: {
              code: 'InvalidAuthenticationToken',
              message: 'Access token has expired'
            }
          }
        }
      } as AxiosError;

      mockHttpClient.get.mockRejectedValueOnce(unauthorizedError);

      await expect(office365Calendar.checkConnection())
        .rejects.toThrow(VError);
      await expect(office365Calendar.checkConnection())
        .rejects.toThrow('Authentication token expired or invalid');
    });
  });

  describe('Network and Timeout Error Handling', () => {
    test('should handle network connection errors', async () => {
      const networkError = {
        code: 'ECONNREFUSED',
        message: 'Connection refused'
      } as AxiosError;

      mockHttpClient.get.mockRejectedValueOnce(networkError);

      const calendarsPromise = (async () => {
        const calendars = [];
        for await (const calendar of office365Calendar.getCalendars()) {
          calendars.push(calendar);
        }
        return calendars;
      })();

      await expect(calendarsPromise).rejects.toThrow(VError);
      await expect(calendarsPromise).rejects.toThrow('Network connection failed');
    });

    test('should handle timeout errors with appropriate message', async () => {
      const timeoutError = {
        code: 'ECONNABORTED',
        message: 'timeout of 10000ms exceeded'
      } as AxiosError;

      mockHttpClient.get.mockRejectedValueOnce(timeoutError);

      await expect(office365Calendar.checkConnection())
        .rejects.toThrow(VError);
      await expect(office365Calendar.checkConnection())
        .rejects.toThrow('Request timeout');
    });

    test('should handle DNS resolution errors', async () => {
      const dnsError = {
        code: 'ENOTFOUND',
        message: 'getaddrinfo ENOTFOUND graph.microsoft.com'
      } as AxiosError;

      mockHttpClient.get.mockRejectedValueOnce(dnsError);

      const calendarsPromise = (async () => {
        const calendars = [];
        for await (const calendar of office365Calendar.getCalendars()) {
          calendars.push(calendar);
        }
        return calendars;
      })();

      await expect(calendarsPromise).rejects.toThrow(VError);
      await expect(calendarsPromise).rejects.toThrow('DNS resolution failed');
    });
  });

  describe('Malformed Response Handling', () => {
    test('should handle malformed JSON responses', async () => {
      const malformedResponse = {
        data: 'invalid json response'
      } as AxiosResponse;

      mockHttpClient.get.mockResolvedValueOnce(malformedResponse);

      const calendarsPromise = (async () => {
        const calendars = [];
        for await (const calendar of office365Calendar.getCalendars()) {
          calendars.push(calendar);
        }
        return calendars;
      })();

      await expect(calendarsPromise).rejects.toThrow(VError);
      await expect(calendarsPromise).rejects.toThrow('Invalid response format');
    });

    test('should handle responses missing required fields', async () => {
      const incompleteResponse = {
        data: {
          // Missing '@odata.context' and 'value' fields
          incomplete: 'response'
        }
      } as AxiosResponse;

      mockHttpClient.get.mockResolvedValueOnce(incompleteResponse);

      const calendarsPromise = (async () => {
        const calendars = [];
        for await (const calendar of office365Calendar.getCalendars()) {
          calendars.push(calendar);
        }
        return calendars;
      })();

      await expect(calendarsPromise).rejects.toThrow(VError);
      await expect(calendarsPromise).rejects.toThrow('Missing required response fields');
    });

    test('should handle empty response gracefully', async () => {
      const emptyResponse = {
        data: null
      } as AxiosResponse;

      mockHttpClient.get.mockResolvedValueOnce(emptyResponse);

      const calendarsPromise = (async () => {
        const calendars = [];
        for await (const calendar of office365Calendar.getCalendars()) {
          calendars.push(calendar);
        }
        return calendars;
      })();

      await expect(calendarsPromise).rejects.toThrow(VError);
      await expect(calendarsPromise).rejects.toThrow('Empty response received');
    });
  });

  describe('Delta Sync Error Handling', () => {
    test('should handle expired delta tokens gracefully', async () => {
      const expiredTokenError = {
        response: {
          status: 410,
          data: {
            error: {
              code: 'InvalidRequest',
              message: 'Sync token has expired'
            }
          }
        }
      } as AxiosError;

      mockHttpClient.get.mockRejectedValueOnce(expiredTokenError);

      const deltaPromise = (async () => {
        const results = [];
        for await (const result of office365Calendar.getEventsIncremental('calendar-id', 'expired-token')) {
          results.push(result);
        }
        return results;
      })();

      await expect(deltaPromise).rejects.toThrow(VError);
      await expect(deltaPromise).rejects.toThrow('Delta token expired');
      
      // Should suggest full refresh
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Delta token has expired, full refresh recommended')
      );
    });

    test('should handle corrupted delta links', async () => {
      const corruptedDeltaLink = 'https://invalid-delta-link';
      
      const badRequestError = {
        response: {
          status: 400,
          data: {
            error: {
              code: 'BadRequest',
              message: 'Invalid delta link format'
            }
          }
        }
      } as AxiosError;

      mockHttpClient.get.mockRejectedValueOnce(badRequestError);

      const deltaPromise = (async () => {
        const results = [];
        for await (const result of office365Calendar.getEventsIncremental('calendar-id', corruptedDeltaLink)) {
          results.push(result);
        }
        return results;
      })();

      await expect(deltaPromise).rejects.toThrow(VError);
      await expect(deltaPromise).rejects.toThrow('Invalid delta link');
    });
  });

  describe('Logging and Debugging', () => {
    test('should log API requests for debugging', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: { value: [] }
      } as AxiosResponse);

      const calendars = [];
      for await (const calendar of office365Calendar.getCalendars()) {
        calendars.push(calendar);
      }

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Making API request to /me/calendars')
      );
    });

    test('should log rate limiting information', async () => {
      const rateLimitError = createRateLimitError('3');

      mockHttpClient.get.mockRejectedValueOnce(rateLimitError);

      jest.useFakeTimers();
      
      const calendarsPromise = (async () => {
        const calendars = [];
        for await (const calendar of office365Calendar.getCalendars()) {
          calendars.push(calendar);
        }
        return calendars;
      })();

      jest.advanceTimersByTime(3000);
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Rate limited, retrying after 3 seconds')
      );
      
      jest.useRealTimers();
    });

    test('should log errors with context information', async () => {
      const graphApiError = {
        response: {
          status: 500,
          data: {
            error: {
              code: 'InternalServerError',
              message: 'An internal server error occurred'
            }
          }
        }
      } as AxiosError;

      mockHttpClient.get.mockRejectedValueOnce(graphApiError);

      const calendarsPromise = (async () => {
        const calendars = [];
        for await (const calendar of office365Calendar.getCalendars()) {
          calendars.push(calendar);
        }
        return calendars;
      })();

      await expect(calendarsPromise).rejects.toThrow();
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to'),
        expect.objectContaining({
          error: expect.any(String)
        })
      );
    });
  });
});