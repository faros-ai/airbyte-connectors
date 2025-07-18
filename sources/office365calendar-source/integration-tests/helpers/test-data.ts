/**
 * Integration Test Data Management
 * 
 * Immutable test data creation and management with predictable, controlled datasets
 * for reliable integration testing.
 */

import { Calendar, Event, EventDateTime, Attendee } from '../../../src/models';
import { CalendarId, asCalendarId } from '../../../src/models';

/**
 * Known test calendar structure for validation.
 */
export interface TestCalendar {
  readonly id: CalendarId;
  readonly name: string;
  readonly description: string;
  readonly expectedEventCount: number;
  readonly timeZone: string;
}

/**
 * Known test event structure for validation.
 */
export interface TestEvent {
  readonly id: string;
  readonly calendarId: CalendarId;
  readonly summary: string;
  readonly description: string;
  readonly startTime: string; // ISO 8601
  readonly endTime: string; // ISO 8601
  readonly attendeeEmails: readonly string[];
  readonly location?: string;
}

/**
 * Immutable test dataset with predictable calendars and events.
 * 
 * This represents the expected state of a controlled test environment.
 */
export const TEST_DATASET = Object.freeze({
  /**
   * Known test calendars with predictable data.
   */
  calendars: Object.freeze([
    {
      id: asCalendarId('test-calendar-basic'),
      name: 'Basic Test Calendar',
      description: 'Calendar for basic integration tests',
      expectedEventCount: 3,
      timeZone: 'America/New_York'
    },
    {
      id: asCalendarId('test-calendar-meetings'),
      name: 'Meeting Test Calendar', 
      description: 'Calendar with meeting events for attendee testing',
      expectedEventCount: 5,
      timeZone: 'America/Los_Angeles'
    },
    {
      id: asCalendarId('test-calendar-recurring'),
      name: 'Recurring Events Calendar',
      description: 'Calendar with recurring events for pattern testing',
      expectedEventCount: 10,
      timeZone: 'UTC'
    }
  ] as readonly TestCalendar[]),

  /**
   * Known test events for validation.
   */
  events: Object.freeze([
    // Basic calendar events
    {
      id: 'test-event-basic-1',
      calendarId: asCalendarId('test-calendar-basic'),
      summary: 'Integration Test Event 1',
      description: 'First test event for basic validation',
      startTime: '2025-01-15T10:00:00Z',
      endTime: '2025-01-15T11:00:00Z',
      attendeeEmails: []
    },
    {
      id: 'test-event-basic-2', 
      calendarId: asCalendarId('test-calendar-basic'),
      summary: 'Integration Test Event 2',
      description: 'Second test event with location',
      startTime: '2025-01-16T14:30:00Z',
      endTime: '2025-01-16T15:30:00Z',
      attendeeEmails: [],
      location: 'Conference Room A'
    },
    {
      id: 'test-event-basic-3',
      calendarId: asCalendarId('test-calendar-basic'),
      summary: 'All Day Test Event',
      description: 'All-day event for date handling testing',
      startTime: '2025-01-17T00:00:00Z',
      endTime: '2025-01-17T23:59:59Z',
      attendeeEmails: []
    },

    // Meeting calendar events
    {
      id: 'test-event-meeting-1',
      calendarId: asCalendarId('test-calendar-meetings'),
      summary: 'Team Standup',
      description: 'Daily team standup meeting',
      startTime: '2025-01-15T09:00:00Z',
      endTime: '2025-01-15T09:30:00Z',
      attendeeEmails: ['alice@test.com', 'bob@test.com', 'charlie@test.com']
    },
    {
      id: 'test-event-meeting-2',
      calendarId: asCalendarId('test-calendar-meetings'),
      summary: 'Project Review',
      description: 'Weekly project review meeting',
      startTime: '2025-01-15T15:00:00Z',
      endTime: '2025-01-15T16:00:00Z',
      attendeeEmails: ['alice@test.com', 'david@test.com'],
      location: 'Room 123'
    }
  ] as readonly TestEvent[]),

  /**
   * Performance testing dataset configuration.
   */
  performance: Object.freeze({
    largeCalendarId: asCalendarId('test-calendar-large-dataset'),
    expectedLargeEventCount: 1000,
    maxProcessingTimeMs: 10000,
    maxMemoryUsageMB: 100
  })
});

/**
 * Creates a mock Calendar object from test data.
 * 
 * @param testCalendar - Test calendar configuration
 * @returns {Calendar} Mock calendar object matching Google Calendar schema
 */
export function createMockCalendar(testCalendar: TestCalendar): Calendar {
  return Object.freeze({
    id: testCalendar.id,
    summary: testCalendar.name,
    description: testCalendar.description,
    time_zone: testCalendar.timeZone,
    access_role: 'reader',
    primary: false,
    selected: true,
    color_id: '1',
    background_color: '#ffffff',
    foreground_color: '#000000'
  });
}

/**
 * Creates a mock Event object from test data.
 * 
 * @param testEvent - Test event configuration
 * @returns {Event} Mock event object matching Google Calendar schema
 */
export function createMockEvent(testEvent: TestEvent): Event {
  const start: EventDateTime = {
    date_time: testEvent.startTime,
    time_zone: 'UTC'
  };

  const end: EventDateTime = {
    date_time: testEvent.endTime,
    time_zone: 'UTC'
  };

  const attendees: Attendee[] = testEvent.attendeeEmails.map(email => ({
    email,
    display_name: email.split('@')[0],
    response_status: 'needsAction' as const,
    optional: false
  }));

  return Object.freeze({
    id: testEvent.id,
    summary: testEvent.summary,
    description: testEvent.description,
    start,
    end,
    attendees: attendees.length > 0 ? attendees : undefined,
    location: testEvent.location,
    status: 'confirmed' as const,
    visibility: 'default' as const,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    creator: {
      email: 'test@example.com',
      display_name: 'Test User'
    },
    organizer: {
      email: 'test@example.com',
      display_name: 'Test User'
    }
  });
}

/**
 * Generates test calendars for the specified test scenario.
 * 
 * @param scenario - Test scenario name
 * @returns {Calendar[]} Array of mock calendars
 */
export function generateTestCalendars(scenario: 'basic' | 'large' | 'all' = 'basic'): Calendar[] {
  switch (scenario) {
    case 'basic':
      return TEST_DATASET.calendars.slice(0, 1).map(createMockCalendar);
    
    case 'large':
      // Return all calendars for comprehensive testing
      return TEST_DATASET.calendars.map(createMockCalendar);
    
    case 'all':
      return TEST_DATASET.calendars.map(createMockCalendar);
    
    default:
      throw new Error(`Unknown test scenario: ${scenario}`);
  }
}

/**
 * Generates test events for the specified calendar and scenario.
 * 
 * @param calendarId - Calendar ID to filter events
 * @param scenario - Test scenario name
 * @returns {Event[]} Array of mock events
 */
export function generateTestEvents(
  calendarId: CalendarId, 
  scenario: 'basic' | 'meetings' | 'all' = 'basic'
): Event[] {
  const filteredEvents = TEST_DATASET.events.filter(event => event.calendarId === calendarId);
  
  switch (scenario) {
    case 'basic':
      return filteredEvents.slice(0, 2).map(createMockEvent);
    
    case 'meetings':
      return filteredEvents.filter(event => event.attendeeEmails.length > 0).map(createMockEvent);
    
    case 'all':
      return filteredEvents.map(createMockEvent);
    
    default:
      throw new Error(`Unknown test scenario: ${scenario}`);
  }
}

/**
 * Creates a test data snapshot for validation.
 * 
 * Used to capture the expected state before/after operations for comparison.
 * 
 * @param calendars - Current calendar state
 * @param events - Current event state 
 * @returns {TestDataSnapshot} Immutable snapshot
 */
export interface TestDataSnapshot {
  readonly timestamp: string;
  readonly calendars: readonly Calendar[];
  readonly events: readonly Event[];
  readonly calendarCount: number;
  readonly eventCount: number;
  readonly eventsByCalendar: Readonly<Record<string, number>>;
}

export function createTestDataSnapshot(
  calendars: Calendar[], 
  events: Event[]
): TestDataSnapshot {
  const eventsByCalendar: Record<string, number> = {};
  
  // Count events per calendar
  calendars.forEach(cal => {
    eventsByCalendar[cal.id] = events.filter(evt => 
      // Note: This assumes events have calendarId property or can be matched
      // In real implementation, events might be fetched per calendar
      true // Placeholder logic
    ).length;
  });

  return Object.freeze({
    timestamp: new Date().toISOString(),
    calendars: Object.freeze([...calendars]),
    events: Object.freeze([...events]),
    calendarCount: calendars.length,
    eventCount: events.length,
    eventsByCalendar: Object.freeze(eventsByCalendar)
  });
}

/**
 * Compares two test data snapshots for changes.
 * 
 * @param before - Snapshot before operation
 * @param after - Snapshot after operation
 * @returns {TestDataComparison} Detailed comparison result
 */
export interface TestDataComparison {
  readonly calendarsChanged: boolean;
  readonly eventsChanged: boolean;
  readonly newCalendars: readonly Calendar[];
  readonly newEvents: readonly Event[];
  readonly removedCalendars: readonly Calendar[];
  readonly removedEvents: readonly Event[];
}

export function compareTestDataSnapshots(
  before: TestDataSnapshot, 
  after: TestDataSnapshot
): TestDataComparison {
  const beforeCalendarIds = new Set(before.calendars.map(cal => cal.id));
  const afterCalendarIds = new Set(after.calendars.map(cal => cal.id));
  
  const beforeEventIds = new Set(before.events.map(evt => evt.id));
  const afterEventIds = new Set(after.events.map(evt => evt.id));

  const newCalendars = after.calendars.filter(cal => !beforeCalendarIds.has(cal.id));
  const removedCalendars = before.calendars.filter(cal => !afterCalendarIds.has(cal.id));
  
  const newEvents = after.events.filter(evt => !beforeEventIds.has(evt.id));
  const removedEvents = before.events.filter(evt => !afterEventIds.has(evt.id));

  return Object.freeze({
    calendarsChanged: newCalendars.length > 0 || removedCalendars.length > 0,
    eventsChanged: newEvents.length > 0 || removedEvents.length > 0,
    newCalendars: Object.freeze(newCalendars),
    newEvents: Object.freeze(newEvents),
    removedCalendars: Object.freeze(removedCalendars),
    removedEvents: Object.freeze(removedEvents)
  });
}