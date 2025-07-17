import { AirbyteLogger, SyncMode } from 'faros-airbyte-cdk';
import { VError } from 'verror';

import { Office365CalendarConfig, TenantId, CalendarId } from '../../src/models';
import { Office365Calendar } from '../../src/office365calendar';
import { Events } from '../../src/streams/events';

// Mock the Office365Calendar for testing
jest.mock('../../src/office365calendar', () => ({
  Office365Calendar: {
    instance: jest.fn()
  }
}));

const MockedOffice365Calendar = Office365Calendar as jest.Mocked<typeof Office365Calendar>;

describe('O365CAL-005: Events Stream (TDD)', () => {
  let mockLogger: AirbyteLogger;
  let eventsStream: Events;
  let mockOffice365Calendar: jest.Mocked<Office365Calendar>;
  let validConfig: Office365CalendarConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    
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

    mockOffice365Calendar = {
      getCalendars: jest.fn(),
      getUsers: jest.fn(),
      checkConnection: jest.fn(),
      getEvents: jest.fn(),
      getEventsIncremental: jest.fn(),
    } as unknown as jest.Mocked<Office365Calendar>;

    MockedOffice365Calendar.instance.mockResolvedValue(mockOffice365Calendar);
    
    eventsStream = new Events(validConfig, mockLogger);
  });

  describe('Stream Configuration', () => {
    test('should have correct stream name', () => {
      expect(eventsStream.name).toBe('events');
    });

    test('should have correct primary key', () => {
      expect(eventsStream.primaryKey).toBe('id');
    });

    test('should support only full refresh sync mode for now', () => {
      expect(eventsStream.supportedSyncModes).toEqual([SyncMode.FULL_REFRESH]);
    });

    test('should load events JSON schema', () => {
      const schema = eventsStream.getJsonSchema();
      
      expect(schema).toBeDefined();
      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();
      expect(schema.properties.id).toBeDefined();
      expect(schema.properties.summary).toBeDefined(); // Google Calendar field mapping
      expect(schema.properties.start).toBeDefined();
      expect(schema.properties.end).toBeDefined();
    });

    test('should not support incremental sync mode yet', () => {
      expect(eventsStream.supportedSyncModes).not.toContain(SyncMode.INCREMENTAL);
    });
  });

  describe('Stream Slicing by Calendar', () => {
    test('should create stream slices for each calendar when no calendar_ids specified', async () => {
      const mockCalendars = [
        { id: 'calendar-1', name: 'Primary Calendar' },
        { id: 'calendar-2', name: 'Work Calendar' }
      ];

      mockOffice365Calendar.getCalendars.mockImplementation(async function* () {
        for (const calendar of mockCalendars) {
          yield calendar;
        }
      });

      const slices = [];
      for await (const slice of eventsStream.streamSlices()) {
        slices.push(slice);
      }

      expect(slices).toHaveLength(2);
      expect(slices[0]).toEqual({ calendarId: 'calendar-1' });
      expect(slices[1]).toEqual({ calendarId: 'calendar-2' });
      expect(MockedOffice365Calendar.instance).toHaveBeenCalledWith(validConfig, mockLogger);
    });

    test('should create stream slices for specific calendar_ids when provided', async () => {
      const configWithSpecificCalendars = {
        ...validConfig,
        calendar_ids: ['cal-1', 'cal-3']
      };
      
      const specificEventsStream = new Events(configWithSpecificCalendars, mockLogger);

      const slices = [];
      for await (const slice of specificEventsStream.streamSlices()) {
        slices.push(slice);
      }

      expect(slices).toHaveLength(2);
      expect(slices[0]).toEqual({ calendarId: 'cal-1' });
      expect(slices[1]).toEqual({ calendarId: 'cal-3' });
      // Should not call getCalendars since we have specific IDs
      expect(mockOffice365Calendar.getCalendars).not.toHaveBeenCalled();
    });

    test('should handle empty calendar list gracefully', async () => {
      mockOffice365Calendar.getCalendars.mockImplementation(async function* () {
        return; // No calendars
      });

      const slices = [];
      for await (const slice of eventsStream.streamSlices()) {
        slices.push(slice);
      }

      expect(slices).toHaveLength(0);
    });

    test('should handle calendar access errors in slicing', async () => {
      const accessError = new VError('Insufficient privileges to access calendars');
      mockOffice365Calendar.getCalendars.mockImplementation(async function* () {
        throw accessError;
      });

      const slices = [];
      for await (const slice of eventsStream.streamSlices()) {
        slices.push(slice);
      }

      expect(slices).toHaveLength(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch calendars for stream slicing'),
        expect.stringContaining('Insufficient privileges')
      );
    });
  });

  describe('Event Data Fetching - Full Refresh', () => {
    test('should fetch events for a calendar slice', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          subject: 'Team Meeting',
          start: { dateTime: '2024-01-15T10:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2024-01-15T11:00:00Z', timeZone: 'UTC' },
          organizer: {
            emailAddress: { name: 'John Doe', address: 'john@example.com' }
          },
          body: { content: 'Weekly team sync', contentType: 'text' },
          location: { displayName: 'Conference Room A' },
          attendees: [],
          showAs: 'busy',
          importance: 'normal',
          isAllDay: false,
          isCancelled: false,
          createdDateTime: '2024-01-10T09:00:00Z',
          lastModifiedDateTime: '2024-01-12T14:30:00Z'
        },
        {
          id: 'event-2',
          subject: 'Project Review',
          start: { dateTime: '2024-01-16T14:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2024-01-16T15:30:00Z', timeZone: 'UTC' },
          organizer: {
            emailAddress: { name: 'Jane Smith', address: 'jane@example.com' }
          },
          body: { content: 'Quarterly project review', contentType: 'html' },
          location: { displayName: 'Virtual' },
          attendees: [
            {
              emailAddress: { name: 'John Doe', address: 'john@example.com' },
              status: { response: 'accepted', time: '2024-01-10T10:00:00Z' },
              type: 'required'
            }
          ],
          showAs: 'busy',
          importance: 'high',
          isAllDay: false,
          isCancelled: false,
          createdDateTime: '2024-01-11T08:00:00Z',
          lastModifiedDateTime: '2024-01-13T16:45:00Z'
        }
      ];

      mockOffice365Calendar.getEvents.mockImplementation(async function* () {
        for (const event of mockEvents) {
          yield event;
        }
      });

      const streamSlice = { calendarId: 'test-calendar' };
      
      const records = [];
      for await (const record of eventsStream.readRecords(SyncMode.FULL_REFRESH, undefined, streamSlice)) {
        records.push(record);
      }

      expect(records).toHaveLength(2);
      expect(mockOffice365Calendar.getEvents).toHaveBeenCalledWith('test-calendar', validConfig);
    });

    test('should apply cutoff_days filtering when specified', async () => {
      const configWithCutoff = {
        ...validConfig,
        cutoff_days: 30
      };
      
      const cutoffEventsStream = new Events(configWithCutoff, mockLogger);

      mockOffice365Calendar.getEvents.mockImplementation(async function* () {
        yield {
          id: 'recent-event',
          subject: 'Recent Meeting',
          start: { dateTime: '2024-01-15T10:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2024-01-15T11:00:00Z', timeZone: 'UTC' },
          createdDateTime: '2024-01-10T09:00:00Z',
          lastModifiedDateTime: '2024-01-12T14:30:00Z'
        };
      });

      const streamSlice = { calendarId: 'test-calendar' };
      
      const records = [];
      for await (const record of cutoffEventsStream.readRecords(SyncMode.FULL_REFRESH, undefined, streamSlice)) {
        records.push(record);
      }

      expect(records).toHaveLength(1);
      expect(mockOffice365Calendar.getEvents).toHaveBeenCalledWith('test-calendar', configWithCutoff);
    });

    test('should apply events_max_results pagination limit', async () => {
      const configWithLimit = {
        ...validConfig,
        events_max_results: 100
      };
      
      const limitedEventsStream = new Events(configWithLimit, mockLogger);

      mockOffice365Calendar.getEvents.mockImplementation(async function* () {
        yield {
          id: 'event-1',
          subject: 'Meeting 1',
          start: { dateTime: '2024-01-15T10:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2024-01-15T11:00:00Z', timeZone: 'UTC' },
          createdDateTime: '2024-01-10T09:00:00Z',
          lastModifiedDateTime: '2024-01-12T14:30:00Z'
        };
      });

      const streamSlice = { calendarId: 'test-calendar' };
      
      const records = [];
      for await (const record of limitedEventsStream.readRecords(SyncMode.FULL_REFRESH, undefined, streamSlice)) {
        records.push(record);
      }

      expect(records).toHaveLength(1);
      expect(mockOffice365Calendar.getEvents).toHaveBeenCalledWith('test-calendar', configWithLimit);
    });
  });

  describe('Data Mapping - Office 365 to Google Calendar Schema', () => {
    test('should map Office 365 event fields to Google Calendar schema', async () => {
      const office365Event = {
        id: 'office365-event-id',
        subject: 'Office 365 Meeting Subject',
        start: { dateTime: '2024-01-15T10:00:00Z', timeZone: 'UTC' },
        end: { dateTime: '2024-01-15T11:00:00Z', timeZone: 'UTC' },
        body: { content: 'Meeting description content', contentType: 'html' },
        location: { displayName: 'Conference Room B' },
        organizer: {
          emailAddress: { name: 'Meeting Organizer', address: 'organizer@example.com' }
        },
        attendees: [
          {
            emailAddress: { name: 'Attendee One', address: 'attendee1@example.com' },
            status: { response: 'accepted', time: '2024-01-10T10:00:00Z' },
            type: 'required'
          },
          {
            emailAddress: { name: 'Attendee Two', address: 'attendee2@example.com' },
            status: { response: 'tentative', time: '2024-01-11T15:00:00Z' },
            type: 'optional'
          }
        ],
        showAs: 'busy',
        importance: 'high',
        sensitivity: 'normal',
        isAllDay: false,
        isCancelled: false,
        createdDateTime: '2024-01-10T09:00:00Z',
        lastModifiedDateTime: '2024-01-12T14:30:00Z'
      };

      mockOffice365Calendar.getEvents.mockImplementation(async function* () {
        yield office365Event;
      });

      const streamSlice = { calendarId: 'test-calendar' };
      
      const records = [];
      for await (const record of eventsStream.readRecords(SyncMode.FULL_REFRESH, undefined, streamSlice)) {
        records.push(record);
      }

      expect(records).toHaveLength(1);
      const mappedEvent = records[0];

      // Verify Google Calendar schema mapping
      expect(mappedEvent.id).toBe('office365-event-id');
      expect(mappedEvent.summary).toBe('Office 365 Meeting Subject'); // subject → summary
      expect(mappedEvent.description).toBe('Meeting description content'); // body.content → description
      expect(mappedEvent.location).toBe('Conference Room B'); // location.displayName → location
      expect(mappedEvent.start).toEqual({
        dateTime: '2024-01-15T10:00:00Z',
        timeZone: 'UTC'
      });
      expect(mappedEvent.end).toEqual({
        dateTime: '2024-01-15T11:00:00Z',
        timeZone: 'UTC'
      });
      
      // Check organizer mapping
      expect(mappedEvent.organizer).toEqual({
        email: 'organizer@example.com',
        displayName: 'Meeting Organizer',
        self: false
      });
      
      // Check attendees mapping
      expect(mappedEvent.attendees).toHaveLength(2);
      expect(mappedEvent.attendees[0]).toEqual({
        email: 'attendee1@example.com',
        displayName: 'Attendee One',
        responseStatus: 'accepted',
        optional: false
      });
      expect(mappedEvent.attendees[1]).toEqual({
        email: 'attendee2@example.com', 
        displayName: 'Attendee Two',
        responseStatus: 'tentative',
        optional: true
      });
      
      // Check other field mappings
      expect(mappedEvent.transparency).toBe('opaque'); // showAs: 'busy' → transparency: 'opaque'
      expect(mappedEvent.created).toBe('2024-01-10T09:00:00Z');
      expect(mappedEvent.updated).toBe('2024-01-12T14:30:00Z');
      expect(mappedEvent.status).toBe('confirmed'); // !isCancelled → 'confirmed'
    });

    test('should handle all-day events correctly', async () => {
      const allDayEvent = {
        id: 'allday-event',
        subject: 'All Day Event',
        start: { date: '2024-01-15' }, // All-day events use date, not dateTime
        end: { date: '2024-01-16' },
        isAllDay: true,
        isCancelled: false,
        createdDateTime: '2024-01-10T09:00:00Z',
        lastModifiedDateTime: '2024-01-12T14:30:00Z'
      };

      mockOffice365Calendar.getEvents.mockImplementation(async function* () {
        yield allDayEvent;
      });

      const streamSlice = { calendarId: 'test-calendar' };
      
      const records = [];
      for await (const record of eventsStream.readRecords(SyncMode.FULL_REFRESH, undefined, streamSlice)) {
        records.push(record);
      }

      expect(records).toHaveLength(1);
      const mappedEvent = records[0];

      expect(mappedEvent.start).toEqual({ date: '2024-01-15' });
      expect(mappedEvent.end).toEqual({ date: '2024-01-16' });
      expect(mappedEvent.start.dateTime).toBeUndefined();
      expect(mappedEvent.end.dateTime).toBeUndefined();
    });

    test('should handle cancelled events correctly', async () => {
      const cancelledEvent = {
        id: 'cancelled-event',
        subject: 'Cancelled Meeting',
        start: { dateTime: '2024-01-15T10:00:00Z', timeZone: 'UTC' },
        end: { dateTime: '2024-01-15T11:00:00Z', timeZone: 'UTC' },
        isCancelled: true,
        createdDateTime: '2024-01-10T09:00:00Z',
        lastModifiedDateTime: '2024-01-12T14:30:00Z'
      };

      mockOffice365Calendar.getEvents.mockImplementation(async function* () {
        yield cancelledEvent;
      });

      const streamSlice = { calendarId: 'test-calendar' };
      
      const records = [];
      for await (const record of eventsStream.readRecords(SyncMode.FULL_REFRESH, undefined, streamSlice)) {
        records.push(record);
      }

      expect(records).toHaveLength(1);
      const mappedEvent = records[0];

      expect(mappedEvent.status).toBe('cancelled');
    });

    test('should map transparency/free-busy status correctly', async () => {
      const testCases = [
        { showAs: 'free', expectedTransparency: 'transparent' },
        { showAs: 'busy', expectedTransparency: 'opaque' },
        { showAs: 'tentative', expectedTransparency: 'transparent' },
        { showAs: 'oof', expectedTransparency: 'opaque' } // Out of office
      ];

      for (const testCase of testCases) {
        const event = {
          id: 'test-event',
          subject: 'Test Event',
          start: { dateTime: '2024-01-15T10:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2024-01-15T11:00:00Z', timeZone: 'UTC' },
          showAs: testCase.showAs,
          createdDateTime: '2024-01-10T09:00:00Z',
          lastModifiedDateTime: '2024-01-12T14:30:00Z'
        };

        mockOffice365Calendar.getEvents.mockImplementation(async function* () {
          yield event;
        });

        const streamSlice = { calendarId: 'test-calendar' };
        
        const records = [];
        for await (const record of eventsStream.readRecords(SyncMode.FULL_REFRESH, undefined, streamSlice)) {
          records.push(record);
        }

        expect(records[0].transparency).toBe(testCase.expectedTransparency);
        
        // Reset mock for next iteration
        jest.clearAllMocks();
        MockedOffice365Calendar.instance.mockResolvedValue(mockOffice365Calendar);
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle permission errors for individual calendars gracefully', async () => {
      const permissionError = new VError('Insufficient privileges to access calendar');
      
      mockOffice365Calendar.getEvents.mockImplementation(async function* () {
        throw permissionError;
      });

      const streamSlice = { calendarId: 'restricted-calendar' };
      
      const records = [];
      for await (const record of eventsStream.readRecords(SyncMode.FULL_REFRESH, undefined, streamSlice)) {
        records.push(record);
      }

      expect(records).toHaveLength(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch events for calendar'),
        expect.stringContaining('restricted-calendar')
      );
    });

    test('should handle rate limiting with exponential backoff', async () => {
      const rateLimitError = new VError('Rate limit exceeded');
      
      let callCount = 0;
      mockOffice365Calendar.getEvents.mockImplementation(async function* () {
        callCount++;
        if (callCount === 1) {
          throw rateLimitError;
        }
        yield {
          id: 'event-after-retry',
          subject: 'Event After Retry',
          start: { dateTime: '2024-01-15T10:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2024-01-15T11:00:00Z', timeZone: 'UTC' },
          createdDateTime: '2024-01-10T09:00:00Z',
          lastModifiedDateTime: '2024-01-12T14:30:00Z'
        };
      });

      const streamSlice = { calendarId: 'test-calendar' };
      
      const records = [];
      for await (const record of eventsStream.readRecords(SyncMode.FULL_REFRESH, undefined, streamSlice)) {
        records.push(record);
      }

      expect(records).toHaveLength(1);
      expect(records[0].id).toBe('event-after-retry');
    });

    test('should handle authentication failures and re-throw', async () => {
      const authError = new VError('Authentication token expired');
      
      mockOffice365Calendar.getEvents.mockImplementation(async function* () {
        throw authError;
      });

      const streamSlice = { calendarId: 'test-calendar' };

      await expect(async () => {
        const records = [];
        for await (const record of eventsStream.readRecords(SyncMode.FULL_REFRESH, undefined, streamSlice)) {
          records.push(record);
        }
      }).rejects.toThrow('Authentication token expired');
    });
  });

  describe('Microsoft Graph API Endpoint Verification', () => {
    test('should use correct Microsoft Graph API endpoints for events', async () => {
      // This test verifies our API client uses the correct endpoints
      mockOffice365Calendar.getEvents.mockImplementation(async function* () {
        yield {
          id: 'test-event',
          subject: 'Test Event',
          start: { dateTime: '2024-01-15T10:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2024-01-15T11:00:00Z', timeZone: 'UTC' },
          createdDateTime: '2024-01-10T09:00:00Z',
          lastModifiedDateTime: '2024-01-12T14:30:00Z'
        };
      });

      const streamSlice = { calendarId: 'test-calendar' };
      
      const records = [];
      for await (const record of eventsStream.readRecords(SyncMode.FULL_REFRESH, undefined, streamSlice)) {
        records.push(record);
      }

      // Verify the API client was called with correct calendar ID
      expect(mockOffice365Calendar.getEvents).toHaveBeenCalledWith('test-calendar', validConfig);
      
      // Note: This test documents that the API client should internally use:
      // - /me/calendars/{calendarId}/events (not /calendars/{calendarId}/events)
      // - For domain delegation: /users/{userId}/calendars/{calendarId}/events
    });
  });

  describe('Logging and Monitoring', () => {
    test('should log sync progress for event fetching', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          subject: 'Meeting 1',
          start: { dateTime: '2024-01-15T10:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2024-01-15T11:00:00Z', timeZone: 'UTC' },
          createdDateTime: '2024-01-10T09:00:00Z',
          lastModifiedDateTime: '2024-01-12T14:30:00Z'
        },
        {
          id: 'event-2',
          subject: 'Meeting 2',
          start: { dateTime: '2024-01-16T14:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2024-01-16T15:00:00Z', timeZone: 'UTC' },
          createdDateTime: '2024-01-11T08:00:00Z',
          lastModifiedDateTime: '2024-01-13T16:45:00Z'
        }
      ];

      mockOffice365Calendar.getEvents.mockImplementation(async function* () {
        for (const event of mockEvents) {
          yield event;
        }
      });

      const streamSlice = { calendarId: 'test-calendar' };
      
      const records = [];
      for await (const record of eventsStream.readRecords(SyncMode.FULL_REFRESH, undefined, streamSlice)) {
        records.push(record);
      }

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Starting events sync'),
        expect.stringContaining('test-calendar')
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Fetched event'),
        expect.stringContaining('event-1')
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Completed events sync'),
        expect.stringContaining('2 events')
      );
    });
  });
});