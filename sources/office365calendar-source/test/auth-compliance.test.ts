import axios, { AxiosResponse, AxiosError } from 'axios';
import { AirbyteLogger } from 'faros-airbyte-cdk';
import { VError } from 'verror';

import { Office365Calendar, Office365CalendarConfig } from '../src/office365calendar';
import { createAuthError, createAxiosError } from './utils/axios-helpers';

// Mock axios for testing
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('O365CAL-003: Microsoft Graph API Compliance Tests (TDD)', () => {
  let mockLogger: AirbyteLogger;
  let validConfig: Office365CalendarConfig;
  
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset singleton and cache between tests
    (Office365Calendar as any).office365Calendar = null;
    (Office365Calendar as any).cachedToken = null;
    
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
      tenant_id: '12345678-1234-1234-1234-123456789012'
    };
  });

  describe('Microsoft Graph Compliance Headers', () => {
    test('should include required User-Agent header in auth requests', async () => {
      const mockTokenResponse = {
        data: { 
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'https://graph.microsoft.com/Calendars.Read'
        }
      } as AxiosResponse;
      
      // Mock tenant validation
      mockedAxios.get.mockResolvedValueOnce({
        data: { issuer: 'https://sts.windows.net/test-tenant/' }
      } as AxiosResponse);
      
      mockedAxios.post.mockResolvedValueOnce(mockTokenResponse);
      mockedAxios.create.mockReturnValueOnce({} as any);

      await Office365Calendar.instance(validConfig, mockLogger);
      
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(URLSearchParams),
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'office365calendar-source/1.0.0',
            'Accept': 'application/json',
            'client-request-id': expect.any(String)
          })
        })
      );
    });

    test('should include User-Agent and Accept headers in HTTP client', async () => {
      const mockTokenResponse = {
        data: { 
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'https://graph.microsoft.com/Calendars.Read'
        }
      } as AxiosResponse;
      
      // Mock tenant validation
      mockedAxios.get.mockResolvedValueOnce({
        data: { issuer: 'https://sts.windows.net/test-tenant/' }
      } as AxiosResponse);
      
      mockedAxios.post.mockResolvedValueOnce(mockTokenResponse);
      mockedAxios.create.mockReturnValueOnce({} as any);

      await Office365Calendar.instance(validConfig, mockLogger);
      
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'office365calendar-source/1.0.0',
            'Accept': 'application/json',
            Authorization: 'Bearer test-token'
          })
        })
      );
    });
  });

  describe('Enhanced Token Response Validation', () => {
    test('should validate token_type is Bearer', async () => {
      const invalidTokenResponse = {
        data: { 
          access_token: 'test-token',
          token_type: 'Basic', // Invalid
          expires_in: 3600,
          scope: 'https://graph.microsoft.com/Calendars.Read'
        }
      } as AxiosResponse;
      
      // Mock tenant validation
      mockedAxios.get.mockResolvedValueOnce({
        data: { issuer: 'https://sts.windows.net/test-tenant/' }
      } as AxiosResponse);
      
      mockedAxios.post.mockResolvedValueOnce(invalidTokenResponse);

      await expect(Office365Calendar.instance(validConfig, mockLogger))
        .rejects.toThrow(VError);
      await expect(Office365Calendar.instance(validConfig, mockLogger))
        .rejects.toThrow("expected token_type 'Bearer', got 'Basic'");
    });

    test('should validate expires_in is present and numeric', async () => {
      const invalidTokenResponse = {
        data: { 
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 'invalid', // Should be number
          scope: 'https://graph.microsoft.com/Calendars.Read'
        }
      } as AxiosResponse;
      
      // Mock tenant validation
      mockedAxios.get.mockResolvedValueOnce({
        data: { issuer: 'https://sts.windows.net/test-tenant/' }
      } as AxiosResponse);
      
      mockedAxios.post.mockResolvedValueOnce(invalidTokenResponse);

      await expect(Office365Calendar.instance(validConfig, mockLogger))
        .rejects.toThrow(VError);
      await expect(Office365Calendar.instance(validConfig, mockLogger))
        .rejects.toThrow('missing or invalid expires_in');
    });

    test('should validate scope contains required permissions', async () => {
      const insufficientScopeResponse = {
        data: { 
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'https://graph.microsoft.com/User.Read' // Missing Calendars.Read
        }
      } as AxiosResponse;
      
      // Mock tenant validation
      mockedAxios.get.mockResolvedValueOnce({
        data: { issuer: 'https://sts.windows.net/test-tenant/' }
      } as AxiosResponse);
      
      mockedAxios.post.mockResolvedValueOnce(insufficientScopeResponse);

      await expect(Office365Calendar.instance(validConfig, mockLogger))
        .rejects.toThrow(VError);
      await expect(Office365Calendar.instance(validConfig, mockLogger))
        .rejects.toThrow("Insufficient permissions: required 'Calendars.Read'");
    });
  });

  describe('Specific Scope Requests', () => {
    test('should request specific Calendars.Read scope instead of .default', async () => {
      const mockTokenResponse = {
        data: { 
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'https://graph.microsoft.com/Calendars.Read'
        }
      } as AxiosResponse;
      
      // Mock tenant validation
      mockedAxios.get.mockResolvedValueOnce({
        data: { issuer: 'https://sts.windows.net/test-tenant/' }
      } as AxiosResponse);
      
      mockedAxios.post.mockResolvedValueOnce(mockTokenResponse);
      mockedAxios.create.mockReturnValueOnce({} as any);

      await Office365Calendar.instance(validConfig, mockLogger);
      
      const formData = mockedAxios.post.mock.calls[0][1] as URLSearchParams;
      expect(formData.get('scope')).toBe('https://graph.microsoft.com/Calendars.Read');
    });
  });

  describe('Tenant Validation', () => {
    test('should validate tenant exists via discovery endpoint', async () => {
      const mockTokenResponse = {
        data: { 
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'https://graph.microsoft.com/Calendars.Read'
        }
      } as AxiosResponse;
      
      // Mock successful tenant validation
      mockedAxios.get.mockResolvedValueOnce({
        data: { issuer: 'https://sts.windows.net/test-tenant/' }
      } as AxiosResponse);
      
      mockedAxios.post.mockResolvedValueOnce(mockTokenResponse);
      mockedAxios.create.mockReturnValueOnce({} as any);

      await Office365Calendar.instance(validConfig, mockLogger);
      
      expect(mockedAxios.get).toHaveBeenCalledWith(
        `https://login.microsoftonline.com/${validConfig.tenant_id}/.well-known/openid-configuration`,
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'office365calendar-source/1.0.0',
            'Accept': 'application/json'
          })
        })
      );
    });

    test('should handle tenant not found error', async () => {
      const tenantNotFoundError = {
        response: { status: 404 }
      } as AxiosError;
      
      mockedAxios.get.mockRejectedValueOnce(tenantNotFoundError);

      await expect(Office365Calendar.instance(validConfig, mockLogger))
        .rejects.toThrow(VError);
      await expect(Office365Calendar.instance(validConfig, mockLogger))
        .rejects.toThrow('Tenant not found');
    });
  });

  describe('Azure AD Error Handling', () => {
    test('should handle invalid_client error with actionable message', async () => {
      // Mock successful tenant validation
      mockedAxios.get.mockResolvedValueOnce({
        data: { issuer: 'https://sts.windows.net/test-tenant/' }
      } as AxiosResponse);
      
      const authError = {
        response: {
          status: 401,
          headers: { 'request-id': 'test-request-id' },
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
        .rejects.toThrow('Invalid client credentials. Verify your client_id and client_secret');
    });

    test('should handle unauthorized_client error with helpful guidance', async () => {
      // Mock successful tenant validation
      mockedAxios.get.mockResolvedValueOnce({
        data: { issuer: 'https://sts.windows.net/test-tenant/' }
      } as AxiosResponse);
      
      const authError = {
        response: {
          status: 401,
          headers: { 'request-id': 'test-request-id' },
          data: {
            error: 'unauthorized_client',
            error_description: 'Application not configured for client credentials flow'
          }
        }
      } as AxiosError;
      
      mockedAxios.post.mockRejectedValueOnce(authError);

      await expect(Office365Calendar.instance(validConfig, mockLogger))
        .rejects.toThrow(VError);
      await expect(Office365Calendar.instance(validConfig, mockLogger))
        .rejects.toThrow('may not be configured for client credentials flow or may need admin consent');
    });
  });

  describe('Token Caching and Lifecycle', () => {
    test('should cache valid tokens and reuse them', async () => {
      const mockTokenResponse = {
        data: { 
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'https://graph.microsoft.com/Calendars.Read'
        }
      } as AxiosResponse;
      
      // Mock tenant validation
      mockedAxios.get.mockResolvedValueOnce({
        data: { issuer: 'https://sts.windows.net/test-tenant/' }
      } as AxiosResponse);
      
      mockedAxios.post.mockResolvedValueOnce(mockTokenResponse);
      mockedAxios.create.mockReturnValue({} as any);

      // First call should authenticate
      await Office365Calendar.instance(validConfig, mockLogger);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      
      // Reset singleton but keep cache
      (Office365Calendar as any).office365Calendar = null;
      
      // Second call should use cached token
      await Office365Calendar.instance(validConfig, mockLogger);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1); // Still just one auth call
    });

    test('should refresh expired tokens automatically', async () => {
      const mockTokenResponse = {
        data: { 
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 1, // Very short expiration
          scope: 'https://graph.microsoft.com/Calendars.Read'
        }
      } as AxiosResponse;
      
      // Mock tenant validation
      mockedAxios.get.mockResolvedValue({
        data: { issuer: 'https://sts.windows.net/test-tenant/' }
      } as AxiosResponse);
      
      mockedAxios.post.mockResolvedValue(mockTokenResponse);
      mockedAxios.create.mockReturnValue({} as any);

      // First authentication
      await Office365Calendar.instance(validConfig, mockLogger);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      
      // Wait for token to expire
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Reset singleton to force re-check
      (Office365Calendar as any).office365Calendar = null;
      
      // Should authenticate again due to expired token
      await Office365Calendar.instance(validConfig, mockLogger);
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });
  });

  describe('Request Correlation and Debugging', () => {
    test('should include correlation IDs in error messages', async () => {
      const mockTokenResponse = {
        data: { 
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'https://graph.microsoft.com/Calendars.Read'
        }
      } as AxiosResponse;
      
      // Mock tenant validation
      mockedAxios.get.mockResolvedValueOnce({
        data: { issuer: 'https://sts.windows.net/test-tenant/' }
      } as AxiosResponse);
      
      mockedAxios.post.mockResolvedValueOnce(mockTokenResponse);
      
      const mockHttpClient = {
        get: jest.fn().mockRejectedValue({
          response: {
            status: 403,
            headers: { 'request-id': 'ms-request-123' },
            data: { error: { code: 'Forbidden', message: 'Access denied' } }
          }
        })
      };
      
      mockedAxios.create.mockReturnValueOnce(mockHttpClient as any);

      const calendar = await Office365Calendar.instance(validConfig, mockLogger);
      
      await expect(calendar.checkConnection()).rejects.toThrow('correlation:');
      await expect(calendar.checkConnection()).rejects.toThrow('request: ms-request-123');
    });

    test('should log correlation IDs for debugging', async () => {
      const mockTokenResponse = {
        data: { 
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'https://graph.microsoft.com/Calendars.Read'
        }
      } as AxiosResponse;
      
      // Mock tenant validation
      mockedAxios.get.mockResolvedValueOnce({
        data: { issuer: 'https://sts.windows.net/test-tenant/' }
      } as AxiosResponse);
      
      mockedAxios.post.mockResolvedValueOnce(mockTokenResponse);
      mockedAxios.create.mockReturnValueOnce({} as any);

      await Office365Calendar.instance(validConfig, mockLogger);
      
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('correlation:')
      );
    });
  });
});