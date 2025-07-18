import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import { AirbyteLogger, AirbyteLogLevel } from 'faros-airbyte-cdk';
import { VError } from 'verror';

import {
  Office365Calendar,
  Office365CalendarConfig,
  Calendar,
  Event,
  DeltaResponse,
  PagedResponse
} from '../src/office365calendar';
import { createAxiosError, createAuthError, createRateLimitError, createServerError } from './utils/axios-helpers';

// Mock axios for testing
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('O365CAL-003: Authentication and API Client (TDD)', () => {
  let mockLogger: AirbyteLogger;
  let validConfig: Office365CalendarConfig;
  
  beforeEach(() => {
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
  });

  describe('OAuth2 Authentication', () => {
    describe('Singleton Pattern', () => {
      test('should create singleton instance with valid config', async () => {
        // Mock successful token response
        mockedAxios.post.mockResolvedValueOnce({
          data: { access_token: 'mock-access-token', token_type: 'Bearer', expires_in: 3600 }
        } as AxiosResponse);
        
        const mockHttpClient = {
          get: jest.fn(),
          post: jest.fn(),
          put: jest.fn(),
          delete: jest.fn(),
        } as unknown as AxiosInstance;
        mockedAxios.create.mockReturnValueOnce(mockHttpClient);

        const instance1 = await Office365Calendar.instance(validConfig, mockLogger);
        const instance2 = await Office365Calendar.instance(validConfig, mockLogger);
        
        expect(instance1).toBe(instance2); // Should be same singleton instance
        expect(mockedAxios.post).toHaveBeenCalledTimes(1); // Token should be cached
      });

      test('should reset singleton and create new instance when needed', async () => {
        // Mock successful token response
        mockedAxios.post.mockResolvedValue({
          data: { access_token: 'mock-access-token', token_type: 'Bearer', expires_in: 3600 }
        } as AxiosResponse);
        
        const mockHttpClient = {} as AxiosInstance;
        mockedAxios.create.mockReturnValue(mockHttpClient);

        const instance1 = await Office365Calendar.instance(validConfig, mockLogger);
        
        // Reset singleton manually (simulating app restart)
        (Office365Calendar as any).office365Calendar = null;
        
        const instance2 = await Office365Calendar.instance(validConfig, mockLogger);
        
        expect(instance1).not.toBe(instance2); // Should be different instances
        expect(mockedAxios.post).toHaveBeenCalledTimes(2); // Should authenticate twice
      });
    });

    describe('Configuration Validation', () => {
      test('should throw VError on missing client_id', async () => {
        const invalidConfig = { ...validConfig, client_id: '' };
        
        await expect(Office365Calendar.instance(invalidConfig, mockLogger))
          .rejects.toThrow(VError);
        await expect(Office365Calendar.instance(invalidConfig, mockLogger))
          .rejects.toThrow('client_id must not be an empty string');
      });

      test('should throw VError on missing client_secret', async () => {
        const invalidConfig = { ...validConfig, client_secret: '' };
        
        await expect(Office365Calendar.instance(invalidConfig, mockLogger))
          .rejects.toThrow(VError);
        await expect(Office365Calendar.instance(invalidConfig, mockLogger))
          .rejects.toThrow('client_secret must not be an empty string');
      });

      test('should throw VError on missing tenant_id', async () => {
        const invalidConfig = { ...validConfig, tenant_id: '' };
        
        await expect(Office365Calendar.instance(invalidConfig, mockLogger))
          .rejects.toThrow(VError);
        await expect(Office365Calendar.instance(invalidConfig, mockLogger))
          .rejects.toThrow('tenant_id must not be an empty string');
      });

      test('should throw VError on invalid tenant_id format', async () => {
        const invalidConfig = { ...validConfig, tenant_id: 'not-a-valid-tenant' };
        
        await expect(Office365Calendar.instance(invalidConfig, mockLogger))
          .rejects.toThrow(VError);
        await expect(Office365Calendar.instance(invalidConfig, mockLogger))
          .rejects.toThrow('tenant_id must be a valid GUID or domain name');
      });
    });

    describe('OAuth2 Token Acquisition', () => {
      test('should obtain access token with correct OAuth2 flow', async () => {
        const mockTokenResponse = {
          data: { 
            access_token: 'test-bearer-token',
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'https://graph.microsoft.com/.default'
          }
        } as AxiosResponse;
        
        mockedAxios.post.mockResolvedValueOnce(mockTokenResponse);
        mockedAxios.create.mockReturnValueOnce({} as AxiosInstance);

        await Office365Calendar.instance(validConfig, mockLogger);
        
        expect(mockedAxios.post).toHaveBeenCalledWith(
          'https://login.microsoftonline.com/test-tenant-id/oauth2/v2.0/token',
          expect.any(URLSearchParams),
          expect.objectContaining({
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
          })
        );
        
        // Verify the form data
        const formData = mockedAxios.post.mock.calls[0][1] as URLSearchParams;
        expect(formData.get('client_id')).toBe('test-client-id');
        expect(formData.get('client_secret')).toBe('test-client-secret');
        expect(formData.get('grant_type')).toBe('client_credentials');
        expect(formData.get('scope')).toBe('https://graph.microsoft.com/.default');
      });

      test('should handle OAuth2 authentication failures gracefully', async () => {
        const authError = {
          response: {
            status: 401,
            data: {
              error: 'invalid_client',
              error_description: 'Invalid client credentials'
            }
          }
        } as AxiosError;
        
        mockedAxios.post.mockRejectedValueOnce(authError);

        await expect(Office365Calendar.instance(validConfig, mockLogger))
          .rejects.toThrow(VError);
        await expect(Office365Calendar.instance(validConfig, mockLogger))
          .rejects.toThrow('Authentication failed');
      });

      test('should handle network failures during authentication', async () => {
        const networkError = {
          code: 'ECONNREFUSED',
          message: 'Connection refused'
        } as AxiosError;
        
        mockedAxios.post.mockRejectedValueOnce(networkError);

        await expect(Office365Calendar.instance(validConfig, mockLogger))
          .rejects.toThrow(VError);
        await expect(Office365Calendar.instance(validConfig, mockLogger))
          .rejects.toThrow('Authentication failed');
      });

      test('should handle malformed token response', async () => {
        const malformedResponse = {
          data: { invalid: 'response' } // Missing access_token
        } as AxiosResponse;
        
        mockedAxios.post.mockResolvedValueOnce(malformedResponse);

        await expect(Office365Calendar.instance(validConfig, mockLogger))
          .rejects.toThrow(VError);
      });
    });

    describe('HTTP Client Configuration', () => {
      test('should create HTTP client with correct configuration', async () => {
        mockedAxios.post.mockResolvedValueOnce({
          data: { access_token: 'test-token' }
        } as AxiosResponse);
        
        const mockHttpClient = {} as AxiosInstance;
        mockedAxios.create.mockReturnValueOnce(mockHttpClient);

        await Office365Calendar.instance(validConfig, mockLogger);
        
        expect(mockedAxios.create).toHaveBeenCalledWith({
          baseURL: 'https://graph.microsoft.com/v1.0',
          timeout: 10000,
          maxContentLength: Infinity,
          headers: {
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json'
          },
        });
      });

      test('should use custom base URL for different Graph API versions', async () => {
        const configWithVersion = { ...validConfig, version: 'beta' };
        
        mockedAxios.post.mockResolvedValueOnce({
          data: { access_token: 'test-token' }
        } as AxiosResponse);
        mockedAxios.create.mockReturnValueOnce({} as AxiosInstance);

        await Office365Calendar.instance(configWithVersion, mockLogger);
        
        expect(mockedAxios.create).toHaveBeenCalledWith(
          expect.objectContaining({
            baseURL: 'https://graph.microsoft.com/beta'
          })
        );
      });
    });
  });

  describe('Connection Validation', () => {
    let office365Calendar: Office365Calendar;
    let mockHttpClient: jest.Mocked<AxiosInstance>;

    beforeEach(async () => {
      mockedAxios.post.mockResolvedValue({
        data: { access_token: 'test-token' }
      } as AxiosResponse);
      
      mockHttpClient = {
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
      } as unknown as jest.Mocked<AxiosInstance>;
      
      mockedAxios.create.mockReturnValue(mockHttpClient);
      office365Calendar = await Office365Calendar.instance(validConfig, mockLogger);
    });

    test('should validate connection with simple API call', async () => {
      const mockCalendarsResponse = {
        data: { value: [] }
      } as AxiosResponse;
      
      mockHttpClient.get.mockResolvedValueOnce(mockCalendarsResponse);

      await expect(office365Calendar.checkConnection()).resolves.not.toThrow();
      
      expect(mockHttpClient.get).toHaveBeenCalledWith('/me/calendars', {
        params: { $top: 1 }
      });
    });

    test('should throw descriptive error on connection failure', async () => {
      const connectionError = {
        response: {
          status: 403,
          data: { error: { message: 'Forbidden' } }
        }
      } as AxiosError;
      
      mockHttpClient.get.mockRejectedValueOnce(connectionError);

      await expect(office365Calendar.checkConnection())
        .rejects.toThrow(VError);
      await expect(office365Calendar.checkConnection())
        .rejects.toThrow('Connection check failed');
    });

    test('should handle timeout during connection check', async () => {
      const timeoutError = {
        code: 'ECONNABORTED',
        message: 'timeout of 10000ms exceeded'
      } as AxiosError;
      
      mockHttpClient.get.mockRejectedValueOnce(timeoutError);

      await expect(office365Calendar.checkConnection())
        .rejects.toThrow(VError);
    });
  });

  describe('API Methods - Calendars', () => {
    let office365Calendar: Office365Calendar;
    let mockHttpClient: jest.Mocked<AxiosInstance>;

    beforeEach(async () => {
      mockedAxios.post.mockResolvedValue({
        data: { access_token: 'test-token' }
      } as AxiosResponse);
      
      mockHttpClient = {
        get: jest.fn(),
      } as unknown as jest.Mocked<AxiosInstance>;
      
      mockedAxios.create.mockReturnValue(mockHttpClient);
      office365Calendar = await Office365Calendar.instance(validConfig, mockLogger);
    });

    test('should fetch calendars with proper API call', async () => {
      const mockCalendarsResponse: PagedResponse<Calendar> = {
        '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#me/calendars',
        value: [
          {
            id: 'calendar-1',
            name: 'Primary Calendar',
            summary: 'Primary Calendar',
            description: 'My main calendar',
            owner: { name: 'John Doe', address: 'john@example.com', email: 'john@example.com' },
            canEdit: true,
            canShare: true,
            canViewPrivateItems: false
          }
        ]
      };
      
      mockHttpClient.get.mockResolvedValueOnce({
        data: mockCalendarsResponse
      } as AxiosResponse);

      const calendars: Calendar[] = [];
      for await (const calendar of office365Calendar.getCalendars()) {
        calendars.push(calendar);
      }
      
      expect(calendars).toHaveLength(1);
      expect(calendars[0].id).toBe('calendar-1');
      expect(calendars[0].name).toBe('Primary Calendar');
      
      expect(mockHttpClient.get).toHaveBeenCalledWith('/me/calendars', {
        params: expect.objectContaining({
          $select: expect.stringContaining('id,name')
        })
      });
    });

    test('should handle pagination in calendar listing', async () => {
      const firstPageResponse: PagedResponse<Calendar> & { '@odata.context': string } = {
        '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#me/calendars',
        '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/calendars?$skiptoken=page2',
        value: [
          { id: 'cal-1', name: 'Calendar 1' } as Calendar
        ]
      };
      
      const secondPageResponse: PagedResponse<Calendar> & { '@odata.context': string } = {
        '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#me/calendars',
        value: [
          { id: 'cal-2', name: 'Calendar 2' } as Calendar
        ]
      };
      
      mockHttpClient.get
        .mockResolvedValueOnce({ data: firstPageResponse } as AxiosResponse)
        .mockResolvedValueOnce({ data: secondPageResponse } as AxiosResponse);

      const calendars: Calendar[] = [];
      for await (const calendar of office365Calendar.getCalendars()) {
        calendars.push(calendar);
      }
      
      expect(calendars).toHaveLength(2);
      expect(calendars[0].id).toBe('cal-1');
      expect(calendars[1].id).toBe('cal-2');
      
      expect(mockHttpClient.get).toHaveBeenCalledTimes(2);
      expect(mockHttpClient.get).toHaveBeenNthCalledWith(2, '/me/calendars', {
        params: expect.objectContaining({
          $skiptoken: 'page2'
        })
      });
    });

    test('should support domain-wide delegation for all users', async () => {
      const configWithDelegation = { ...validConfig, domain_wide_delegation: true };
      
      // Reset singleton and create new instance with delegation
      (Office365Calendar as any).office365Calendar = null;
      mockedAxios.post.mockResolvedValue({
        data: { access_token: 'delegation-token' }
      } as AxiosResponse);
      
      const delegationCalendar = await Office365Calendar.instance(configWithDelegation, mockLogger);
      
      const mockUsersResponse = {
        data: {
          value: [
            { id: 'user-1', mail: 'user1@example.com' },
            { id: 'user-2', mail: 'user2@example.com' }
          ]
        }
      } as AxiosResponse;
      
      mockHttpClient.get.mockResolvedValueOnce(mockUsersResponse);

      const users: any[] = [];
      for await (const user of delegationCalendar.getUsers()) {
        users.push(user);
      }
      
      expect(users).toHaveLength(2);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/users', expect.any(Object));
    });
  });

  describe('API Methods - Events', () => {
    let office365Calendar: Office365Calendar;
    let mockHttpClient: jest.Mocked<AxiosInstance>;

    beforeEach(async () => {
      mockedAxios.post.mockResolvedValue({
        data: { access_token: 'test-token' }
      } as AxiosResponse);
      
      mockHttpClient = {
        get: jest.fn(),
      } as unknown as jest.Mocked<AxiosInstance>;
      
      mockedAxios.create.mockReturnValue(mockHttpClient);
      office365Calendar = await Office365Calendar.instance(validConfig, mockLogger);
    });

    test('should fetch events with cutoff_days filtering', async () => {
      const configWithCutoff = { ...validConfig, cutoff_days: 30 };
      const expectedStartDate = new Date();
      expectedStartDate.setDate(expectedStartDate.getDate() - 30);
      
      const mockEventsResponse: PagedResponse<Event> & { '@odata.context': string } = {
        '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#me/events',
        value: [
          {
            id: 'event-1',
            subject: 'Test Meeting',
            start: { dateTime: '2024-01-01T10:00:00', timeZone: 'UTC' },
            end: { dateTime: '2024-01-01T11:00:00', timeZone: 'UTC' }
          } as Event
        ]
      };
      
      mockHttpClient.get.mockResolvedValueOnce({
        data: mockEventsResponse
      } as AxiosResponse);

      const events: Event[] = [];
      for await (const event of office365Calendar.getEvents('calendar-id', configWithCutoff)) {
        events.push(event);
      }
      
      expect(events).toHaveLength(1);
      expect(events[0].subject).toBe('Test Meeting');
      
      expect(mockHttpClient.get).toHaveBeenCalledWith('/calendars/calendar-id/events', {
        params: expect.objectContaining({
          $filter: expect.stringMatching(/start\/dateTime ge '\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}'/)
        })
      });
    });

    test('should respect events_max_results pagination limit', async () => {
      const configWithLimit = { ...validConfig, events_max_results: 100 };
      
      mockHttpClient.get.mockResolvedValueOnce({
        data: { value: [] }
      } as AxiosResponse);

      const events: Event[] = [];
      for await (const event of office365Calendar.getEvents('calendar-id', configWithLimit)) {
        events.push(event);
      }
      
      expect(mockHttpClient.get).toHaveBeenCalledWith('/calendars/calendar-id/events', {
        params: expect.objectContaining({
          $top: 100
        })
      });
    });

    test('should handle incremental sync with delta queries', async () => {
      const deltaLink = 'https://graph.microsoft.com/v1.0/me/events/delta?$deltatoken=abc123';
      
      const mockDeltaResponse: DeltaResponse & { value: Event[] } = {
        '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#Collection(event)',
        '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/events/delta?$deltatoken=xyz789',
        value: [
          {
            id: 'event-updated',
            subject: 'Updated Meeting',
            lastModifiedDateTime: '2024-01-02T10:00:00Z'
          } as Event,
          {
            id: 'event-deleted',
            '@removed': { reason: 'deleted' }
          } as Event
        ]
      };
      
      mockHttpClient.get.mockResolvedValueOnce({
        data: mockDeltaResponse
      } as AxiosResponse);

      const results: { events: Event[], nextDeltaLink?: string } = { events: [] };
      for await (const result of office365Calendar.getEventsIncremental('calendar-id', deltaLink)) {
        results.events.push(result.event);
        results.nextDeltaLink = result.nextDeltaLink;
      }
      
      expect(results.events).toHaveLength(2);
      expect(results.events[0].subject).toBe('Updated Meeting');
      expect(results.events[1]['@removed']).toBeDefined();
      expect(results.nextDeltaLink).toBe('https://graph.microsoft.com/v1.0/me/events/delta?$deltatoken=xyz789');
      
      expect(mockHttpClient.get).toHaveBeenCalledWith('/calendars/calendar-id/events/delta', {
        params: { $deltatoken: 'abc123' }
      });
    });
  });
});