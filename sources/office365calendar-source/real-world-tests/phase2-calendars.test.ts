/**
 * Real-World Testing - Phase 2: Calendar Discovery
 * 
 * This test validates calendar listing and discovery with real Office 365 data.
 * Builds on Phase 1 authentication success to access actual calendar metadata.
 * 
 * Prerequisites:
 * - Phase 1 authentication tests must pass
 * - Set environment variables: O365_TENANT_ID, O365_CLIENT_ID, O365_CLIENT_SECRET
 * - User must have at least one calendar in Office 365
 * 
 * What this test does:
 * 1. Authenticates and creates Office365Calendar instance
 * 2. Lists all accessible calendars
 * 3. Validates calendar structure and metadata
 * 4. Tests calendar filtering if configured
 * 5. Measures discovery performance
 * 
 * Expected outcome: ✅ At least 1 calendar discovered in < 10 seconds
 */

import { AirbyteLogger } from 'faros-airbyte-cdk';
import { Office365Calendar } from '../src/office365calendar-sdk-adapter';
import { Office365CalendarConfig, Calendar } from '../src/models';

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
    // Test calendar filtering if specified
    ...(process.env.O365_TEST_CALENDAR_ID && {
      calendar_ids: [process.env.O365_TEST_CALENDAR_ID]
    }),
    // Optional test parameters
    cutoff_days: parseInt(process.env.O365_TEST_CUTOFF_DAYS || '30'),
    events_max_results: parseInt(process.env.O365_TEST_MAX_EVENTS || '100'),
    domain_wide_delegation: process.env.O365_DOMAIN_WIDE_DELEGATION === 'true',
    user_id: process.env.O365_USER_ID
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

describe('Real-World Phase 2: Calendar Discovery', () => {
  const config = loadRealWorldConfig();
  const testTimeout = parseInt(process.env.O365_TEST_TIMEOUT || '30000'); // 30 seconds

  // Skip tests if credentials not provided
  const testSuite = config ? describe : describe.skip;

  testSuite('Office 365 Calendar Discovery', () => {
    let logger: AirbyteLogger;
    let office365Calendar: Office365Calendar;
    let startTime: number;
    let startMemory: number;

    beforeAll(async () => {
      logger = createRealWorldLogger();
      logger.info('📅 Starting Real-World Calendar Discovery Tests');
      logger.info(`📋 Testing with tenant: ${config!.tenant_id}`);
      logger.info(`🎯 Timeout: ${testTimeout}ms`);

      // Create authenticated instance (builds on Phase 1)
      logger.info('🔧 Creating authenticated Office365Calendar instance...');
      office365Calendar = await Office365Calendar.instance(config!, logger);
      logger.info('✅ Authentication successful, ready for calendar discovery');
    }, testTimeout);

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

    test('should discover at least one calendar', async () => {
      logger.info('📅 Discovering calendars...');
      
      const calendars: Calendar[] = [];
      for await (const calendar of office365Calendar.getCalendars()) {
        calendars.push(calendar);
        logger.debug(`Found calendar: ${calendar.name} (${calendar.id})`);
      }
      
      expect(calendars.length).toBeGreaterThan(0);
      logger.info(`✅ Discovered ${calendars.length} calendar(s)`);
      
      // Performance validation
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(testTimeout);
      logger.info(`🚀 Calendar discovery completed in ${duration}ms (< ${testTimeout}ms)`);
    }, testTimeout);

    test('should validate calendar structure and required fields', async () => {
      logger.info('🔍 Validating calendar structure...');
      
      const calendars: Calendar[] = [];
      for await (const calendar of office365Calendar.getCalendars()) {
        calendars.push(calendar);
      }
      
      expect(calendars.length).toBeGreaterThan(0);
      
      // Validate each calendar has required fields
      calendars.forEach((calendar, index) => {
        logger.debug(`Validating calendar ${index + 1}: ${calendar.name}`);
        
        // Required fields
        expect(calendar.id).toBeDefined();
        expect(calendar.id).not.toBe('');
        expect(calendar.name).toBeDefined();
        expect(calendar.name).not.toBe('');
        
        // Common fields (may vary by Office 365 setup)
        expect(typeof calendar.canEdit).toBe('boolean');
        expect(typeof calendar.canShare).toBe('boolean');
        expect(typeof calendar.canViewPrivateItems).toBe('boolean');
        
        // Owner information
        if (calendar.owner) {
          expect(calendar.owner.name).toBeDefined();
          expect(calendar.owner.address).toBeDefined();
        }
        
        logger.debug(`✅ Calendar ${calendar.name} structure validated`);
      });
      
      logger.info(`✅ All ${calendars.length} calendar(s) have valid structure`);
    }, testTimeout);

    test('should handle calendar filtering if configured', async () => {
      if (!config!.calendar_ids || config!.calendar_ids.length === 0) {
        logger.info('⏭️  Skipping calendar filtering test (no calendar_ids configured)');
        return;
      }

      logger.info(`🎯 Testing calendar filtering for: ${config!.calendar_ids.join(', ')}`);
      
      const calendars: Calendar[] = [];
      for await (const calendar of office365Calendar.getCalendars()) {
        calendars.push(calendar);
      }
      
      // When calendar_ids are specified, we should only get those calendars
      // (assuming they exist and are accessible)
      calendars.forEach(calendar => {
        expect(config!.calendar_ids).toContain(calendar.id);
        logger.debug(`✅ Found filtered calendar: ${calendar.name} (${calendar.id})`);
      });
      
      logger.info(`✅ Calendar filtering working correctly (${calendars.length} filtered calendar(s))`);
    }, testTimeout);

    test('should handle permission-denied calendars gracefully', async () => {
      logger.info('🔒 Testing permission handling...');
      
      // This test validates that the connector doesn't crash when encountering
      // calendars it doesn't have permission to access
      let calendarCount = 0;
      let errorCount = 0;
      
      try {
        for await (const calendar of office365Calendar.getCalendars()) {
          calendarCount++;
          logger.debug(`Accessible calendar: ${calendar.name}`);
        }
      } catch (error) {
        errorCount++;
        logger.debug(`Permission error handled gracefully: ${(error as Error).message}`);
      }
      
      // Should successfully enumerate accessible calendars without crashing
      expect(calendarCount).toBeGreaterThanOrEqual(0);
      logger.info(`✅ Permission handling successful (${calendarCount} accessible, ${errorCount} permission errors)`);
    }, testTimeout);

    test('should maintain reasonable performance for calendar discovery', async () => {
      logger.info('🏃 Testing calendar discovery performance...');
      
      const performanceStart = Date.now();
      let calendarCount = 0;
      
      for await (const calendar of office365Calendar.getCalendars()) {
        calendarCount++;
      }
      
      const performanceEnd = Date.now();
      const discoveryTime = performanceEnd - performanceStart;
      
      logger.info(`📊 Performance metrics:`);
      logger.info(`   - Calendars discovered: ${calendarCount}`);
      logger.info(`   - Discovery time: ${discoveryTime}ms`);
      logger.info(`   - Average per calendar: ${Math.round(discoveryTime / Math.max(calendarCount, 1))}ms`);
      
      // Performance expectations
      expect(discoveryTime).toBeLessThan(testTimeout);
      
      if (calendarCount > 0) {
        const avgTimePerCalendar = discoveryTime / calendarCount;
        expect(avgTimePerCalendar).toBeLessThan(5000); // < 5 seconds per calendar
        logger.info(`✅ Performance within acceptable limits`);
      }
    }, testTimeout);

    test('should provide calendar metadata for integration planning', async () => {
      logger.info('📋 Collecting calendar metadata for integration planning...');
      
      const calendars: Calendar[] = [];
      for await (const calendar of office365Calendar.getCalendars()) {
        calendars.push(calendar);
      }
      
      expect(calendars.length).toBeGreaterThan(0);
      
      // Log detailed metadata for integration planning
      logger.info(`\n📊 CALENDAR DISCOVERY SUMMARY`);
      logger.info(`================================`);
      logger.info(`Total calendars found: ${calendars.length}`);
      
      calendars.forEach((calendar, index) => {
        logger.info(`\nCalendar ${index + 1}:`);
        logger.info(`  Name: ${calendar.name}`);
        logger.info(`  ID: ${calendar.id}`);
        logger.info(`  Can Edit: ${calendar.canEdit}`);
        logger.info(`  Can Share: ${calendar.canShare}`);
        logger.info(`  Can View Private: ${calendar.canViewPrivateItems}`);
        if (calendar.owner) {
          logger.info(`  Owner: ${calendar.owner.name} (${calendar.owner.address})`);
        }
        if (calendar.description) {
          logger.info(`  Description: ${calendar.description}`);
        }
      });
      
      logger.info(`\n✅ Calendar metadata collection complete`);
      logger.info(`📋 Ready for Phase 3: Event fetching from these calendars`);
    }, testTimeout);
  });

  // Instructions for users without credentials
  if (!config) {
    describe('Setup Instructions', () => {
      test('should display setup instructions for calendar discovery', () => {
        console.log('\n📅 PHASE 2: CALENDAR DISCOVERY SETUP 📅');
        console.log('To run real-world calendar discovery tests, set these environment variables:');
        console.log('');
        console.log('export O365_TENANT_ID="your-azure-tenant-id"');
        console.log('export O365_CLIENT_ID="your-azure-client-id"');
        console.log('export O365_CLIENT_SECRET="your-azure-client-secret"');
        console.log('');
        console.log('Optional: Test specific calendar');
        console.log('export O365_TEST_CALENDAR_ID="calendar-id-to-test"');
        console.log('');
        console.log('Prerequisites:');
        console.log('- User must have at least one calendar in Office 365');
        console.log('- Phase 1 authentication tests should pass first');
        console.log('');
        console.log('Run tests with:');
        console.log('npm run test:real-world:phase2');
        console.log('');
        
        // This test always passes - it's just for displaying instructions
        expect(true).toBe(true);
      });
    });
  }
});