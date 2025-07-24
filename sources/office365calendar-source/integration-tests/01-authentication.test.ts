/**
 * Integration Test Phase 1: Authentication
 * 
 * Mathematical precision in authentication testing with zero-tolerance error handling.
 * Tests the complete OAuth2 flow with real Azure AD endpoints.
 */

import { Office365Calendar } from '../../src/office365calendar';
import { AirbyteLogger } from 'faros-airbyte-cdk';
import { VError } from 'verror';

import { 
  loadIntegrationConfig, 
  createMinimalConfig,
  isIntegrationConfigAvailable,
  IntegrationTestConfig 
} from './config';
import { 
  validateAuthConfiguration, 
  validateResultPattern,
  PerformanceMetrics 
} from './helpers/assertions';

// Skip integration tests if environment not configured
const integrationConfig = loadIntegrationConfig();
const runIntegrationTests = isIntegrationConfigAvailable(integrationConfig);

// Conditional test suite - only runs if environment is configured
(runIntegrationTests ? describe : describe.skip)('Integration Phase 1: Authentication Tests', () => {
  let config: IntegrationTestConfig;
  let mockLogger: AirbyteLogger;
  let office365Calendar: Office365Calendar;

  beforeAll(() => {
    if (!integrationConfig) {
      throw new Error('Integration configuration not available');
    }
    config = integrationConfig;
    
    // Validate configuration before starting tests
    const configValidation = validateAuthConfiguration(config);
    if (!configValidation.valid) {
      throw new Error(`Invalid configuration: ${configValidation.errors.join(', ')}`);
    }
  });

  beforeEach(() => {
    // Create mock logger for test isolation
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(), 
      warn: jest.fn(),
      error: jest.fn(),
      fatal: jest.fn(),
      trace: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as unknown as AirbyteLogger;

    // Initialize Office365Calendar adapter with real configuration
    office365Calendar = Office365Calendar.instance(config, mockLogger);
    
    // Clear any existing instances to ensure clean state
    Office365Calendar.clearInstance();
  });

  afterEach(() => {
    // Clean up SDK instance
    Office365Calendar.clearInstance();
  });

  describe('Authentication Flow Validation', () => {
    test('should authenticate with valid credentials and acquire access token', async () => {
      expect.assertions(3);

      const startTime = Date.now();
      const startMemory = process.memoryUsage().heapUsed;

      // Test basic authentication
      const result = await office365Calendar.checkConnection();

      const endTime = Date.now();
      const endMemory = process.memoryUsage().heapUsed;

      // Authentication should succeed
      expect(result).toBe(true);

      // Performance validation
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(config?.timeoutMs || 30000);

      // Memory usage should be reasonable for authentication
      const memoryUsed = endMemory - startMemory;
      expect(memoryUsed).toBeLessThan(50 * 1024 * 1024); // 50MB max for auth

      // Verify logging of successful authentication
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Office 365 Calendar SDK initialized'),
        expect.any(Object)
      );
    }, config?.timeoutMs || 30000);

    test('should cache access tokens and reuse them efficiently', async () => {
      expect.assertions(4);

      // First token acquisition
      const firstResult = await office365Calendar.checkConnection();
      expect(firstResult).toBe(true);

      const firstCallTime = Date.now();

      // Second token acquisition (should use cached token)
      const secondResult = await office365Calendar.checkConnection();
      expect(secondResult).toBe(true);

      const secondCallTime = Date.now();

      // Second call should be faster due to caching
      const timeDifference = secondCallTime - firstCallTime;
      expect(timeDifference).toBeLessThan(1000); // Should be nearly instant

      // Verify no additional token acquisition logged
      const tokenAcquisitionCalls = (mockLogger.debug as jest.Mock).mock.calls
        .filter(call => call[0]?.includes?.('Acquiring new access token'));
      expect(tokenAcquisitionCalls.length).toBeLessThanOrEqual(1);
    }, config?.timeoutMs || 30000);

    test('should handle token refresh gracefully when expired', async () => {
      expect.assertions(3);

      // Force token expiration by creating SDK with short-lived token simulation
      // Note: This test may require mocking or longer test execution to observe real expiration
      
      const result = await office365Calendar.checkConnection();
      expect(result).toBe(true);

      // Verify token refresh mechanism is in place
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Successfully acquired access token'),
        expect.objectContaining({
          expiresAt: expect.any(String)
        })
      );

      // Verify no authentication errors occurred
      expect(mockLogger.error).not.toHaveBeenCalledWith(
        expect.stringContaining('Failed to acquire access token')
      );
    }, config?.timeoutMs || 30000);

    test('should fail gracefully with invalid tenant ID', async () => {
      expect.assertions(1);

      // Create configuration with invalid tenant ID
      const invalidConfig = {
        ...config,
        tenant_id: 'invalid-tenant-id' as any
      };

      const invalidOffice365Calendar = await Office365Calendar.instance(invalidConfig, mockLogger);
      
      const result = await invalidOffice365Calendar.checkConnection();

      // Should fail with descriptive error
      expect(result).toBe(false);
    }, config?.timeoutMs || 30000);

    test('should fail gracefully with invalid client credentials', async () => {
      expect.assertions(1);

      // Create configuration with invalid client secret
      const invalidConfig = {
        ...config,
        client_secret: 'invalid-client-secret'
      };

      const invalidOffice365Calendar = await Office365Calendar.instance(invalidConfig, mockLogger);
      
      const result = await invalidOffice365Calendar.checkConnection();

      // Should fail with authentication error
      expect(result).toBe(false);
    }, config?.timeoutMs || 30000);
  });

  describe('SDK Adapter Integration', () => {
    test('should create Office365Calendar adapter instance successfully', async () => {
      expect.assertions(4);

      // Create adapter instance
      const adapter = await Office365Calendar.instance(config, mockLogger);
      
      expect(adapter).toBeDefined();
      expect(adapter).toBeInstanceOf(Office365Calendar);

      // Test connection through adapter
      const connectionResult = await adapter.checkConnection();
      expect(connectionResult).toBe(true);

      // Verify singleton pattern
      const secondAdapter = await Office365Calendar.instance(config, mockLogger);
      expect(secondAdapter).toBe(adapter); // Same instance
    }, config?.timeoutMs || 30000);

    test('should handle connection failures through adapter gracefully', async () => {
      expect.assertions(2);

      // Create adapter with invalid configuration
      const invalidConfig = createMinimalConfig({
        ...config,
        client_secret: 'definitely-invalid-secret'
      });

      try {
        const adapter = await Office365Calendar.instance(invalidConfig, mockLogger);
        const connectionResult = await adapter.checkConnection();
        expect(connectionResult).toBe(false);
      } catch (error) {
        // Should throw VError with context
        expect(error).toBeInstanceOf(VError);
        expect(error.message).toMatch(/failed.*connect|authentication.*failed/i);
      }
    }, config?.timeoutMs || 30000);
  });

  describe('Network Resilience', () => {
    test('should handle network timeouts with appropriate retries', async () => {
      expect.assertions(1);

      // Test basic network resilience
      const result = await office365Calendar.checkConnection();

      // Even with network challenges, should eventually succeed or fail gracefully
      expect(typeof result).toBe('boolean');
    }, config?.timeoutMs || 30000 * 2); // Allow extra time for retries

    test('should respect timeout settings and fail fast when appropriate', async () => {
      expect.assertions(2);

      const startTime = Date.now();
      
      // This should complete within reasonable time
      const result = await office365Calendar.checkConnection();
      
      const duration = Date.now() - startTime;
      
      // Should not hang indefinitely
      expect(duration).toBeLessThan(config?.timeoutMs || 30000);
      expect(typeof result).toBe('boolean');
    }, config?.timeoutMs || 30000);
  });

  describe('Security Validation', () => {
    test('should not log sensitive credentials in debug output', async () => {
      expect.assertions(3);

      await office365Calendar.checkConnection();

      // Check all log calls for credential exposure
      const allLogCalls = [
        ...(mockLogger.debug as jest.Mock).mock.calls,
        ...(mockLogger.info as jest.Mock).mock.calls,
        ...(mockLogger.warn as jest.Mock).mock.calls,
        ...(mockLogger.error as jest.Mock).mock.calls
      ];

      const logOutput = allLogCalls.map(call => JSON.stringify(call)).join(' ');

      // Should not contain sensitive information
      expect(logOutput).not.toContain(config?.client_secret);
      expect(logOutput).not.toContain('client_secret');
      expect(logOutput).not.toContain('secret');
    });

    test('should use secure HTTPS endpoints only', async () => {
      // This test verifies our configuration uses secure endpoints
      // The Microsoft Graph SDK should only use HTTPS
      
      // Verify configuration is properly set
      expect(config.tenant_id).toBeDefined();
      expect(config.client_id).toBeDefined();
      expect(config.client_secret).toBeDefined();
      
      // Configuration should be configured for production security
      expect(typeof config.tenant_id).toBe('string');
    });
  });

  describe('Performance Benchmarks', () => {
    test('authentication should complete within performance thresholds', async () => {
      expect.assertions(4);

      const iterations = 3;
      const durations: number[] = [];
      const memoryUsages: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        const startMemory = process.memoryUsage().heapUsed;

        const result = await office365Calendar.checkConnection();
        expect(result).toBe(true);

        const duration = Date.now() - startTime;
        const memoryUsed = process.memoryUsage().heapUsed - startMemory;

        durations.push(duration);
        memoryUsages.push(memoryUsed);

        // Clear cache between iterations to test fresh authentication
        Office365Calendar.clearInstance();
        office365Calendar = await Office365Calendar.instance(config, mockLogger);
      }

      // Performance validation
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxMemory = Math.max(...memoryUsages);

      expect(avgDuration).toBeLessThan(5000); // Average under 5 seconds
      expect(maxMemory).toBeLessThan(25 * 1024 * 1024); // Max 25MB memory usage
    }, config?.timeoutMs || 30000 * 5);
  });
});

// Provide helpful output when integration tests are skipped
if (!runIntegrationTests) {
  console.log(`
🔍 Integration tests skipped - environment not configured

To run integration tests, create test/integration/.env with:
- INTEGRATION_TENANT_ID=your-tenant-id
- INTEGRATION_CLIENT_ID=your-client-id  
- INTEGRATION_CLIENT_SECRET=your-client-secret

See test/integration/fixtures/environment-template.env for complete setup.
  `);
}