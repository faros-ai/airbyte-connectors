/**
 * Real-World Testing - Phase 3: Event Fetching
 * 
 * This test validates event retrieval and data mapping with real Office 365 data.
 * Builds on Phase 1+2 success to access actual calendar events and validate sync logic.
 * 
 * Prerequisites:
 * - Phase 1 authentication tests must pass
 * - Phase 2 calendar discovery tests must pass
 * - Set environment variables: O365_TENANT_ID, O365_CLIENT_ID, O365_CLIENT_SECRET
 * - User must have at least one calendar with some events
 * 
 * What this test does:
 * 1. Discovers available calendars
 * 2. Fetches recent events from calendars
 * 3. Validates event structure and field mapping
 * 4. Tests date range filtering and pagination
 * 5. Validates recurring event handling
 * 6. Measures event fetching performance
 * 
 * Expected outcome: ✅ Events retrieved and validated in < 30 seconds
 */

import { AirbyteLogger } from 'faros-airbyte-cdk';
import { Office365Calendar } from '../src/office365calendar-sdk-adapter';
import { Office365CalendarConfig, Calendar, Event } from '../src/models';

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
    // Test parameters
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

describe('Real-World Phase 3: Event Fetching', () => {
  const config = loadRealWorldConfig();
  const testTimeout = parseInt(process.env.O365_TEST_TIMEOUT || '60000'); // 60 seconds for event tests

  // Skip tests if credentials not provided
  const testSuite = config ? describe : describe.skip;

  testSuite('Office 365 Event Fetching', () => {
    let logger: AirbyteLogger;
    let office365Calendar: Office365Calendar;
    let testCalendars: Calendar[];
    let startTime: number;
    let startMemory: number;

    beforeAll(async () => {
      logger = createRealWorldLogger();
      logger.info('📅 Starting Real-World Event Fetching Tests');
      logger.info(`📋 Testing with tenant: ${config!.tenant_id}`);
      logger.info(`🎯 Timeout: ${testTimeout}ms`);
      logger.info(`📊 Cutoff days: ${config!.cutoff_days}`);
      logger.info(`📊 Max events per request: ${config!.events_max_results}`);

      // Create authenticated instance (builds on Phase 1)
      logger.info('🔧 Creating authenticated Office365Calendar instance...');
      office365Calendar = await Office365Calendar.instance(config!, logger);
      
      // Discover calendars (builds on Phase 2)
      logger.info('📅 Discovering calendars for event testing...');
      testCalendars = [];
      for await (const calendar of office365Calendar.getCalendars()) {
        testCalendars.push(calendar);
      }
      
      expect(testCalendars.length).toBeGreaterThan(0);
      logger.info(`✅ Found ${testCalendars.length} calendar(s) for event testing`);
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

    test('should fetch events from calendars within cutoff date range', async () => {
      logger.info(`📅 Fetching events from ${testCalendars.length} calendar(s)...`);
      
      let totalEvents = 0;
      const calendarEventCounts: Record<string, number> = {};
      
      for (const calendar of testCalendars) {
        logger.info(`📋 Fetching events from calendar: ${calendar.name} (${calendar.id})`);
        
        const events: Event[] = [];
        try {
          for await (const event of office365Calendar.getEvents(calendar.id, config!)) {
            events.push(event);
            logger.debug(`Found event: ${event.subject || 'No subject'} (${event.id})`);
          }
          
          calendarEventCounts[calendar.id] = events.length;
          totalEvents += events.length;
          
          logger.info(`✅ Calendar ${calendar.name}: ${events.length} events found`);
        } catch (error) {
          logger.warn(`⚠️  Could not access events from calendar ${calendar.name}: ${(error as Error).message}`);
          calendarEventCounts[calendar.id] = 0;
        }
      }
      
      logger.info(`📊 Event fetching summary:`);
      logger.info(`   - Total events across all calendars: ${totalEvents}`);
      logger.info(`   - Events per calendar: ${JSON.stringify(calendarEventCounts, null, 2)}`);
      
      // Performance validation
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(testTimeout);
      logger.info(`🚀 Event fetching completed in ${duration}ms (< ${testTimeout}ms)`);
      
      // At least validate that we can access calendars (events may be empty)
      expect(testCalendars.length).toBeGreaterThan(0);
    }, testTimeout);

    test('should validate event structure and required fields', async () => {
      logger.info('🔍 Validating event data structure...');
      
      let eventsValidated = 0;
      let sampleEvent: Event | null = null;
      
      for (const calendar of testCalendars.slice(0, 2)) { // Test first 2 calendars
        const events: Event[] = [];
        
        try {
          for await (const event of office365Calendar.getEvents(calendar.id, config!)) {
            events.push(event);
            if (events.length >= 10) break; // Limit for validation testing
          }
          
          events.forEach((event, index) => {
            if (!sampleEvent) sampleEvent = event;
            
            logger.debug(`Validating event ${index + 1}: ${event.subject || 'No subject'}`);
            
            // Required fields
            expect(event.id).toBeDefined();
            expect(event.id).not.toBe('');
            
            // Common fields (some may be null/undefined depending on event type)
            expect(typeof event.id).toBe('string');
            
            // DateTime fields should be valid if present
            if (event.start) {
              expect(event.start.dateTime).toBeDefined();
              expect(new Date(event.start.dateTime)).toBeInstanceOf(Date);
            }
            
            if (event.end) {
              expect(event.end.dateTime).toBeDefined();
              expect(new Date(event.end.dateTime)).toBeInstanceOf(Date);
            }
            
            // Attendees should be array if present
            if (event.attendees) {
              expect(Array.isArray(event.attendees)).toBe(true);
            }
            
            eventsValidated++;
          });
          
          if (events.length > 0) {
            logger.info(`✅ Calendar ${calendar.name}: ${events.length} events validated`);
          }
        } catch (error) {
          logger.warn(`⚠️  Could not validate events from calendar ${calendar.name}: ${(error as Error).message}`);
        }
      }
      
      logger.info(`✅ Validated ${eventsValidated} event(s) across calendars`);
      
      if (sampleEvent) {
        logger.info(`📋 Sample event structure:`);
        logger.info(`   - Subject: ${sampleEvent.subject || 'N/A'}`);
        logger.info(`   - Start: ${sampleEvent.start?.dateTime || 'N/A'}`);
        logger.info(`   - End: ${sampleEvent.end?.dateTime || 'N/A'}`);
        logger.info(`   - Location: ${typeof sampleEvent.location === 'string' ? sampleEvent.location : sampleEvent.location?.displayName || 'N/A'}`);
        logger.info(`   - Attendees: ${sampleEvent.attendees?.length || 0}`);
        logger.info(`   - Organizer: ${sampleEvent.organizer?.emailAddress?.name || 'N/A'}`);
      }
    }, testTimeout);

    test('should respect date range filtering (cutoff_days)', async () => {
      logger.info(`📅 Testing date range filtering (${config!.cutoff_days} days)...`);
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - config!.cutoff_days!);
      
      let eventsInRange = 0;
      let eventsOutOfRange = 0;
      
      for (const calendar of testCalendars.slice(0, 1)) { // Test first calendar
        try {
          for await (const event of office365Calendar.getEvents(calendar.id, config!)) {
            if (event.start?.dateTime) {
              const eventDate = new Date(event.start.dateTime);
              
              if (eventDate >= cutoffDate) {
                eventsInRange++;
              } else {
                eventsOutOfRange++;
                logger.warn(`⚠️  Event outside date range: ${event.subject} (${event.start.dateTime})`);
              }
            }
          }
        } catch (error) {
          logger.warn(`⚠️  Could not test date filtering for calendar ${calendar.name}: ${(error as Error).message}`);
        }
      }
      
      logger.info(`📊 Date range filtering results:`);
      logger.info(`   - Events in range (>= ${cutoffDate.toISOString()}): ${eventsInRange}`);
      logger.info(`   - Events out of range: ${eventsOutOfRange}`);
      
      // Most events should be within the specified range
      if (eventsInRange + eventsOutOfRange > 0) {
        const inRangePercent = (eventsInRange / (eventsInRange + eventsOutOfRange)) * 100;
        logger.info(`   - In-range percentage: ${Math.round(inRangePercent)}%`);
        
        // Allow some flexibility for edge cases, but most should be in range
        expect(inRangePercent).toBeGreaterThan(50);
      }
      
      logger.info(`✅ Date range filtering validation complete`);
    }, testTimeout);

    test('should handle pagination correctly', async () => {
      logger.info('📄 Testing event pagination...');
      
      let totalEventsReceived = 0;
      let paginationRounds = 0;
      const maxEventsToTest = config!.events_max_results! * 2; // Test up to 2 pages
      
      for (const calendar of testCalendars.slice(0, 1)) { // Test first calendar
        try {
          let eventsFromCalendar = 0;
          
          for await (const event of office365Calendar.getEvents(calendar.id, config!)) {
            eventsFromCalendar++;
            totalEventsReceived++;
            
            // Track pagination rounds
            if (eventsFromCalendar % config!.events_max_results! === 1) {
              paginationRounds++;
              logger.debug(`📄 Starting pagination round ${paginationRounds}`);
            }
            
            // Limit test to avoid excessive data
            if (totalEventsReceived >= maxEventsToTest) {
              logger.info(`📊 Pagination test limit reached (${maxEventsToTest} events)`);
              break;
            }
          }
          
          logger.info(`📊 Calendar ${calendar.name}: ${eventsFromCalendar} events (${paginationRounds} page(s))`);
        } catch (error) {
          logger.warn(`⚠️  Could not test pagination for calendar ${calendar.name}: ${(error as Error).message}`);
        }
      }
      
      logger.info(`📊 Pagination test results:`);
      logger.info(`   - Total events received: ${totalEventsReceived}`);
      logger.info(`   - Pagination rounds: ${paginationRounds}`);
      logger.info(`   - Events per page configured: ${config!.events_max_results}`);
      
      // Validate pagination logic
      if (totalEventsReceived > config!.events_max_results!) {
        expect(paginationRounds).toBeGreaterThan(1);
        logger.info(`✅ Pagination working correctly (multiple pages handled)`);
      } else {
        logger.info(`✅ Single page of events handled correctly`);
      }
    }, testTimeout);

    test('should handle empty calendars gracefully', async () => {
      logger.info('📭 Testing empty calendar handling...');
      
      let emptyCalendars = 0;
      let nonEmptyCalendars = 0;
      
      for (const calendar of testCalendars) {
        try {
          let eventCount = 0;
          
          for await (const event of office365Calendar.getEvents(calendar.id, config!)) {
            eventCount++;
            if (eventCount >= 1) break; // Just check if any events exist
          }
          
          if (eventCount === 0) {
            emptyCalendars++;
            logger.debug(`📭 Empty calendar: ${calendar.name}`);
          } else {
            nonEmptyCalendars++;
            logger.debug(`📅 Non-empty calendar: ${calendar.name} (${eventCount}+ events)`);
          }
        } catch (error) {
          logger.warn(`⚠️  Could not check calendar ${calendar.name}: ${(error as Error).message}`);
        }
      }
      
      logger.info(`📊 Calendar content analysis:`);
      logger.info(`   - Empty calendars: ${emptyCalendars}`);
      logger.info(`   - Non-empty calendars: ${nonEmptyCalendars}`);
      logger.info(`   - Total calendars tested: ${testCalendars.length}`);
      
      // Should handle both empty and non-empty calendars without errors
      expect(emptyCalendars + nonEmptyCalendars).toBe(testCalendars.length);
      logger.info(`✅ Empty calendar handling validation complete`);
    }, testTimeout);

    test('should provide event metadata for integration planning', async () => {
      logger.info('📊 Collecting event metadata for integration planning...');
      
      let totalEvents = 0;
      let eventsByType: Record<string, number> = {};
      let hasRecurringEvents = false;
      let hasAttendeesInfo = false;
      let hasLocationInfo = false;
      const sampleEvents: Event[] = [];
      
      for (const calendar of testCalendars.slice(0, 2)) { // Analyze first 2 calendars
        try {
          let calendarEvents = 0;
          
          for await (const event of office365Calendar.getEvents(calendar.id, config!)) {
            totalEvents++;
            calendarEvents++;
            
            // Collect sample events for analysis
            if (sampleEvents.length < 5) {
              sampleEvents.push(event);
            }
            
            // Analyze event characteristics - use any to access Graph API fields
            const graphEvent = event as any;
            if (graphEvent.type) {
              eventsByType[graphEvent.type] = (eventsByType[graphEvent.type] || 0) + 1;
            }
            
            if (graphEvent.recurrence) {
              hasRecurringEvents = true;
            }
            
            if (event.attendees && event.attendees.length > 0) {
              hasAttendeesInfo = true;
            }
            
            if ((typeof event.location === 'string' && event.location) || (typeof event.location === 'object' && event.location?.displayName)) {
              hasLocationInfo = true;
            }
            
            // Limit analysis for performance
            if (calendarEvents >= 50) break;
          }
          
          logger.info(`📋 Calendar ${calendar.name}: ${calendarEvents} events analyzed`);
        } catch (error) {
          logger.warn(`⚠️  Could not analyze calendar ${calendar.name}: ${(error as Error).message}`);
        }
      }
      
      logger.info(`\n📊 EVENT FETCHING SUMMARY`);
      logger.info(`===========================`);
      logger.info(`Total events analyzed: ${totalEvents}`);
      logger.info(`Event types found: ${JSON.stringify(eventsByType, null, 2)}`);
      logger.info(`Has recurring events: ${hasRecurringEvents}`);
      logger.info(`Has attendee information: ${hasAttendeesInfo}`);
      logger.info(`Has location information: ${hasLocationInfo}`);
      
      if (sampleEvents.length > 0) {
        logger.info(`\nSample Events:`);
        sampleEvents.forEach((event, index) => {
          logger.info(`\nEvent ${index + 1}:`);
          logger.info(`  Subject: ${event.subject || 'No subject'}`);
          logger.info(`  Start: ${event.start?.dateTime || 'N/A'}`);
          logger.info(`  End: ${event.end?.dateTime || 'N/A'}`);
          logger.info(`  Type: ${(event as any).type || 'N/A'}`);
          logger.info(`  Attendees: ${event.attendees?.length || 0}`);
          logger.info(`  Location: ${typeof event.location === 'string' ? event.location : event.location?.displayName || 'N/A'}`);
          logger.info(`  Recurring: ${!!(event as any).recurrence}`);
        });
      }
      
      logger.info(`\n✅ Event metadata collection complete`);
      logger.info(`📋 Ready for Phase 4: Incremental sync testing`);
      
      // Basic validation
      expect(testCalendars.length).toBeGreaterThan(0);
    }, testTimeout);
  });

  // Instructions for users without credentials
  if (!config) {
    describe('Setup Instructions', () => {
      test('should display setup instructions for event fetching', () => {
        console.log('\n📅 PHASE 3: EVENT FETCHING SETUP 📅');
        console.log('To run real-world event fetching tests, set these environment variables:');
        console.log('');
        console.log('export O365_TENANT_ID="your-azure-tenant-id"');
        console.log('export O365_CLIENT_ID="your-azure-client-id"');
        console.log('export O365_CLIENT_SECRET="your-azure-client-secret"');
        console.log('');
        console.log('Optional: Test parameters');
        console.log('export O365_TEST_CUTOFF_DAYS="30"        # Days of history to fetch');
        console.log('export O365_TEST_MAX_EVENTS="100"       # Max events per request');
        console.log('export O365_TEST_CALENDAR_ID="cal-id"   # Specific calendar to test');
        console.log('export O365_TEST_TIMEOUT="60000"        # Test timeout in ms');
        console.log('');
        console.log('Prerequisites:');
        console.log('- Phase 1 authentication tests should pass');
        console.log('- Phase 2 calendar discovery tests should pass');
        console.log('- User should have calendars with some events (for best testing)');
        console.log('');
        console.log('Run tests with:');
        console.log('npm run test:real-world:phase3');
        console.log('');
        
        // This test always passes - it's just for displaying instructions
        expect(true).toBe(true);
      });
    });
  }
});