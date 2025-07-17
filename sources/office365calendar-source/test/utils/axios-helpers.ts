import axios, { AxiosError, AxiosInstance, AxiosResponse } from 'axios';
import { createMockHttpClient, createTokenResponse } from './test-helpers';

/**
 * Test utility to create properly typed AxiosError mock objects.
 * This ensures type safety and prevents casting issues in tests.
 */
export function createAxiosError(
  status: number,
  message: string,
  headers: Record<string, string> = {},
  data?: any
): AxiosError {
  const error = new Error(message) as AxiosError;
  error.isAxiosError = true;
  error.response = {
    status,
    statusText: getStatusText(status),
    headers,
    config: {} as any,
    data: data || { error: { message } }
  };
  error.config = {} as any;
  error.toJSON = () => ({});
  error.name = 'AxiosError';
  error.message = message;
  return error;
}

/**
 * Create an authentication error (401)
 */
export function createAuthError(
  errorCode: string = 'invalid_client',
  description: string = 'Client authentication failed'
): AxiosError {
  return createAxiosError(401, description, { 'request-id': 'test-request-id' }, {
    error: errorCode,
    error_description: description
  });
}

/**
 * Create a rate limit error (429)
 */
export function createRateLimitError(retryAfter: string = '5'): AxiosError {
  return createAxiosError(429, 'Too Many Requests', { 'retry-after': retryAfter });
}

/**
 * Create a generic server error (500)
 */
export function createServerError(message: string = 'Internal Server Error'): AxiosError {
  return createAxiosError(500, message);
}

/**
 * Create a not found error (404)
 */
export function createNotFoundError(message: string = 'Not Found'): AxiosError {
  return createAxiosError(404, message);
}

/**
 * Create a forbidden error (403)
 */
export function createForbiddenError(message: string = 'Forbidden'): AxiosError {
  return createAxiosError(403, message);
}

/**
 * Get standard HTTP status text for a given status code
 */
function getStatusText(status: number): string {
  const statusTexts: Record<number, string> = {
    200: 'OK',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable'
  };
  return statusTexts[status] || 'Unknown';
}

/**
 * Sets up axios mocking for tests.
 * Eliminates duplication of axios mock setup across test files.
 */
export interface AxiosMockSetup {
  mockedAxios: jest.Mocked<typeof axios>;
  mockHttpClient: jest.Mocked<AxiosInstance>;
}

export function setupAxiosMocks(): AxiosMockSetup {
  jest.mock('axios');
  const mockedAxios = axios as jest.Mocked<typeof axios>;
  const mockHttpClient = createMockHttpClient();
  
  // Setup default successful authentication
  mockedAxios.post.mockResolvedValue(createTokenResponse());
  mockedAxios.create.mockReturnValue(mockHttpClient);
  
  return {
    mockedAxios,
    mockHttpClient
  };
}

/**
 * Resets axios mocks to clean state.
 * Common cleanup pattern across test files.
 */
export function resetAxiosMocks(): void {
  jest.clearAllMocks();
  // Reset singleton between tests - common pattern
  const office365Calendar = require('../../src/office365calendar').Office365Calendar;
  (office365Calendar as any).office365Calendar = null;
}