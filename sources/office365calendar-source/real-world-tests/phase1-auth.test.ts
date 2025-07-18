/**
 * Real-World Testing - Phase 1: Authentication & Connection
 * 
 * This test validates basic authentication with Office 365 using real credentials.
 * It's designed to be the first test you run to verify your setup works.
 * 
 * Prerequisites:
 * - Set environment variables: O365_TENANT_ID, O365_CLIENT_ID, O365_CLIENT_SECRET
 * - Ensure Azure AD app has appropriate permissions
 * 
 * What this test does:
 * 1. Creates Office365Calendar instance with real config
 * 2. Attempts to authenticate and get access token
 * 3. Validates connection health
 * 4. Measures performance and memory usage
 * 
 * Expected outcome: ✅ Authentication successful in < 10 seconds
 */

import { AirbyteLogger } from 'faros-airbyte-cdk';
import { Office365Calendar } from '../src/office365calendar-sdk-adapter';
import { Office365CalendarConfig } from '../src/models';

// Helper to load real credentials from environment
function loadRealWorldConfig(): Office365CalendarConfig | null {
  const tenantId = process.env.O365_TENANT_ID;
  const clientId = process.env.O365_CLIENT_ID;
  const clientSecret = process.env.O365_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    return null;
  }

  return {
    tenant_id: tenantId,
    client_id: clientId,
    client_secret: clientSecret,
    // Optional test parameters
    cutoff_days: parseInt(process.env.O365_TEST_CUTOFF_DAYS || '30'),
    events_max_results: parseInt(process.env.O365_TEST_MAX_EVENTS || '100'),
    ...(process.env.O365_TEST_CALENDAR_ID && {
      calendar_ids: [process.env.O365_TEST_CALENDAR_ID]
    })
  };
}

function createRealWorldLogger(): AirbyteLogger {
  const logger = {
    debug: (message: string, extra?: any) => console.log(`🔍 DEBUG: ${message}`, extra || ''),
    info: (message: string, extra?: any) => console.log(`ℹ️  INFO: ${message}`, extra || ''),
    warn: (message: string, extra?: any) => console.log(`⚠️  WARN: ${message}`, extra || ''),
    error: (message: string, extra?: any) => console.log(`❌ ERROR: ${message}`, extra || ''),
    fatal: (message: string, extra?: any) => console.log(`💀 FATAL: ${message}`, extra || ''),
    trace: (message: string, extra?: any) => console.log(`🔬 TRACE: ${message}`, extra || ''),
    child: () => logger,
    level: 'info' as any,
    traceError: (error: Error, message?: string) => console.log(`🔬 TRACE ERROR: ${message || error.message}`),
    write: (message: string) => console.log(message),
    asPino: () => logger as any
  };
  return logger as unknown as AirbyteLogger;
}

describe('Real-World Phase 1: Authentication & Connection', () => {
  const config = loadRealWorldConfig();
  const testTimeout = parseInt(process.env.O365_TEST_TIMEOUT || '30000'); // 30 seconds

  // Skip tests if credentials not provided
  const testSuite = config ? describe : describe.skip;

  testSuite('Office 365 Authentication', () => {
    let logger: AirbyteLogger;
    let office365Calendar: Office365Calendar;
    let startTime: number;
    let startMemory: number;

    beforeAll(() => {
      logger = createRealWorldLogger();
      logger.info('🚀 Starting Real-World Authentication Tests');
      logger.info(`📋 Testing with tenant: ${config!.tenant_id}`);
      logger.info(`🎯 Timeout: ${testTimeout}ms`);
    });

    beforeEach(() => {
      startTime = Date.now();
      startMemory = process.memoryUsage().heapUsed;
    });

    afterEach(() => {
      const duration = Date.now() - startTime;
      const endMemory = process.memoryUsage().heapUsed;
      const memoryDelta = endMemory - startMemory;
      
      logger.info(`⏱️  Test completed in ${duration}ms`);
      logger.info(`💾 Memory delta: ${Math.round(memoryDelta / 1024 / 1024 * 100) / 100}MB`);
    });

    test('should create Office365Calendar instance successfully', async () => {
      logger.info('🔧 Creating Office365Calendar instance...');
      
      office365Calendar = await Office365Calendar.instance(config!, logger);
      
      expect(office365Calendar).toBeDefined();
      logger.info('✅ Office365Calendar instance created successfully');
    }, testTimeout);

    test('should authenticate and establish connection', async () => {
      logger.info('🔐 Testing authentication...');
      
      const connectionResult = await office365Calendar.checkConnection();
      
      expect(connectionResult).toBe(true);
      logger.info('✅ Authentication successful!');
      
      // Performance validation
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(testTimeout);
      logger.info(`🚀 Authentication completed in ${duration}ms (< ${testTimeout}ms)`);
    }, testTimeout);

    test('should validate access token properties', async () => {
      logger.info('🎫 Validating access token...');
      
      // Note: We don't expose the token directly for security reasons,
      // but we can verify the connection works which implies valid token
      const connectionResult = await office365Calendar.checkConnection();
      expect(connectionResult).toBe(true);
      
      logger.info('✅ Access token validation passed');
    }, testTimeout);

    test('should handle multiple connection checks efficiently', async () => {
      logger.info('🔄 Testing connection efficiency...');
      
      const results = [];
      const iterations = 3;
      
      for (let i = 0; i < iterations; i++) {
        const checkStart = Date.now();
        const result = await office365Calendar.checkConnection();
        const checkDuration = Date.now() - checkStart;
        
        results.push({ result, duration: checkDuration });
        logger.debug(`Check ${i + 1}: ${result} (${checkDuration}ms)`);
      }
      
      // All checks should succeed
      expect(results.every(r => r.result)).toBe(true);
      
      // Subsequent checks should be faster (token caching)
      if (results.length > 1) {
        const firstCheck = results[0].duration;
        const subsequentAvg = results.slice(1).reduce((sum, r) => sum + r.duration, 0) / (results.length - 1);
        
        logger.info(`🏃 First check: ${firstCheck}ms, Subsequent avg: ${Math.round(subsequentAvg)}ms`);
        
        // Subsequent checks should typically be faster due to token caching
        // (though this might not always be true depending on network conditions)
        if (subsequentAvg < firstCheck) {
          logger.info('✅ Token caching appears to be working');
        }
      }
    }, testTimeout * 2);

    test('should maintain reasonable memory usage', async () => {
      logger.info('💾 Testing memory efficiency...');
      
      const memoryBefore = process.memoryUsage().heapUsed;
      
      // Perform several operations to test memory stability
      for (let i = 0; i < 5; i++) {
        await office365Calendar.checkConnection();
      }
      
      const memoryAfter = process.memoryUsage().heapUsed;
      const memoryDelta = memoryAfter - memoryBefore;
      const memoryDeltaMB = memoryDelta / 1024 / 1024;
      
      logger.info(`💾 Memory usage delta: ${Math.round(memoryDeltaMB * 100) / 100}MB`);
      
      // Should not consume excessive memory for basic operations
      expect(memoryDeltaMB).toBeLessThan(50); // Less than 50MB for auth operations
      
      logger.info('✅ Memory usage within acceptable limits');
    }, testTimeout);
  });

  // Instructions for users without credentials
  if (!config) {
    describe('Setup Instructions', () => {
      test('should display setup instructions', () => {
        console.log('\n🔧 SETUP REQUIRED 🔧');
        console.log('To run real-world authentication tests, set these environment variables:');
        console.log('');
        console.log('export O365_TENANT_ID="your-azure-tenant-id"');
        console.log('export O365_CLIENT_ID="your-azure-client-id"');
        console.log('export O365_CLIENT_SECRET="your-azure-client-secret"');
        console.log('');
        console.log('Optional configuration:');
        console.log('export O365_TEST_TIMEOUT="30000"        # Test timeout in ms');
        console.log('export O365_TEST_CALENDAR_ID="cal-id"   # Specific calendar to test');
        console.log('export O365_TEST_MAX_EVENTS="100"       # Max events per request');
        console.log('export O365_TEST_CUTOFF_DAYS="30"       # Days of history to sync');
        console.log('');
        console.log('📋 Required Azure AD App Permissions:');
        console.log('- https://graph.microsoft.com/Calendars.Read');
        console.log('- https://graph.microsoft.com/User.Read');
        console.log('');
        console.log('Then run: npm run test:real-world:auth');
        console.log('');
        
        // This test always passes - it's just for displaying instructions
        expect(true).toBe(true);
      });
    });
  }
});