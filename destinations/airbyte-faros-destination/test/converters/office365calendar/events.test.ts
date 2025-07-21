import {AirbyteLogger, AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../../../src/converters/converter';
import {Events} from '../../../src/converters/office365calendar/events';

describe('Office365Calendar Events Converter', () => {
  let converter: Events;
  let mockStreamContext: StreamContext;

  beforeEach(() => {
    converter = new Events();
    
    // Create mock FarosClient with location resolution
    const mockFarosClient = {
      geocode: jest.fn().mockResolvedValue([{
        uid: 'Conference Room A, Building 1',
        raw: 'Conference Room A, Building 1',
        address: {
          uid: 'ConferenceRoomA-Building1-Address',
          fullAddress: 'Conference Room A, Building 1, 123 Business Ave, San Francisco, CA 94102, USA',
          street: 'Business Avenue',
          houseNumber: '123',
          unit: 'Conference Room A',
          postalCode: '94102',
          city: 'San Francisco',
          state: 'California',
          stateCode: 'CA',
          country: 'United States',
          countryCode: 'US',
        },
        coordinates: {lat: 37.7849, lon: -122.4094},
      }])
    };
    
    mockStreamContext = new StreamContext(
      new AirbyteLogger(),
      {
        edition_configs: {},
        source_specific_configs: {
          office365calendar: {
            resolve_locations: true
          }
        }
      },
      {}, // streamsSyncMode
      undefined, // graph
      undefined, // origin
      mockFarosClient as any // farosClient
    );
  });

  describe('Converter Properties', () => {
    test('should have correct source identifier', () => {
      expect(converter.source).toBe('Office365Calendar');
    });

    test('should declare correct destination models', () => {
      const expectedModels: DestinationModel[] = [
        'cal_Event',
        'cal_EventGuestAssociation',
        'cal_User',
        'geo_Address', 
        'geo_Coordinates',
        'geo_Location',
      ];
      expect(converter.destinationModels).toEqual(expectedModels);
    });

    test('should extract event ID correctly', () => {
      const record = AirbyteRecord.make('events', {
        id: 'test-event-123',
        summary: 'Test Meeting'
      });
      expect(converter.id(record)).toBe('test-event-123');
    });
  });

  describe('Basic Event Conversion', () => {
    test('should convert simple Office 365 event to cal_Event model', async () => {
      const eventRecord = AirbyteRecord.make('events', {
        id: 'simple-event-1',
        kind: 'calendar#event',
        etag: '"abc123"',
        status: 'confirmed',
        htmlLink: 'https://outlook.office365.com/calendar/item/simple-event-1',
        created: '2023-01-01T08:00:00.000Z',
        updated: '2023-01-01T08:30:00.000Z',
        summary: 'Team Stand-up',
        description: 'Daily team synchronization meeting',
        location: 'Conference Room A',
        start: {
          dateTime: '2023-01-02T09:00:00.000Z',
          timeZone: 'America/New_York'
        },
        end: {
          dateTime: '2023-01-02T09:30:00.000Z', 
          timeZone: 'America/New_York'
        },
        transparency: 'opaque',
        visibility: 'default',
        calendarId: 'test-calendar-1'
      });

      const result = await converter.convert(eventRecord, mockStreamContext);
      
      // Should produce at least one cal_Event record
      const eventRecords = result.filter(r => r.model === 'cal_Event');
      expect(eventRecords).toHaveLength(1);
      
      const calEvent = eventRecords[0].record;
      expect(calEvent).toMatchObject({
        uid: 'simple-event-1',
        calendar: {
          uid: 'test-calendar-1',
          source: 'Office365Calendar'
        },
        title: 'Team Stand-up',
        description: 'Daily team synchronization meeting',
        url: 'https://outlook.office365.com/calendar/item/simple-event-1',
        timeZone: 'America/New_York'
      });
    });

    test('should handle all-day events correctly', async () => {
      const allDayEvent = AirbyteRecord.make('events', {
        id: 'allday-event-1',
        summary: 'Company Retreat',
        start: {
          date: '2023-01-15',
          timeZone: 'America/New_York'
        },
        end: {
          date: '2023-01-16',
          timeZone: 'America/New_York'
        },
        calendarId: 'test-calendar-1'
      });

      const result = await converter.convert(allDayEvent, mockStreamContext);
      
      const eventRecords = result.filter(r => r.model === 'cal_Event');
      expect(eventRecords).toHaveLength(1);
      
      const calEvent = eventRecords[0].record;
      expect(calEvent.start).toBeDefined();
      expect(calEvent.end).toBeDefined();
      expect(calEvent.durationMs).toBeDefined();
    });
  });

  describe('Attendee and User Processing', () => {
    test('should create cal_User records for attendees', async () => {
      const eventWithAttendees = AirbyteRecord.make('events', {
        id: 'event-with-attendees',
        summary: 'Team Meeting',
        attendees: [
          {
            id: 'user1@company.com',
            email: 'user1@company.com',
            displayName: 'John Smith',
            responseStatus: 'accepted',
            optional: false
          },
          {
            id: 'user2@company.com', 
            email: 'user2@company.com',
            displayName: 'Jane Doe',
            responseStatus: 'tentative',
            optional: true
          }
        ],
        calendarId: 'test-calendar-1'
      });

      const result = await converter.convert(eventWithAttendees, mockStreamContext);
      
      // Should create cal_User records for each attendee
      const userRecords = result.filter(r => r.model === 'cal_User');
      expect(userRecords).toHaveLength(2);
      
      const johnRecord = userRecords.find(r => r.record.email === 'user1@company.com');
      expect(johnRecord).toBeDefined();
      expect(johnRecord!.record).toMatchObject({
        uid: 'user1@company.com',
        source: 'Office365Calendar',
        email: 'user1@company.com',
        displayName: 'John Smith'
      });
    });

    test('should create cal_EventGuestAssociation records for attendees', async () => {
      const eventWithAttendees = AirbyteRecord.make('events', {
        id: 'event-with-guests',
        summary: 'Team Meeting',
        attendees: [
          {
            email: 'attendee@company.com',
            displayName: 'Attendee Name',
            responseStatus: 'accepted',
            optional: false
          }
        ],
        calendarId: 'test-calendar-1'
      });

      const result = await converter.convert(eventWithAttendees, mockStreamContext);
      
      // Should create cal_EventGuestAssociation for each attendee
      const guestAssociations = result.filter(r => r.model === 'cal_EventGuestAssociation');
      expect(guestAssociations).toHaveLength(1);
      
      const association = guestAssociations[0].record;
      expect(association).toMatchObject({
        event: {
          uid: 'event-with-guests',
          calendar: {
            uid: 'test-calendar-1',
            source: 'Office365Calendar'
          }
        },
        guest: {
          uid: 'attendee@company.com',
          source: 'Office365Calendar'
        },
        status: {
          category: 'Accepted',
          detail: 'accepted'
        }
      });
    });

    test('should handle organizer as both creator and user', async () => {
      const eventWithOrganizer = AirbyteRecord.make('events', {
        id: 'event-with-organizer',
        summary: 'Organized Meeting',
        organizer: {
          email: 'organizer@company.com',
          displayName: 'Meeting Organizer',
          self: false
        },
        calendarId: 'test-calendar-1'
      });

      const result = await converter.convert(eventWithOrganizer, mockStreamContext);
      
      // Should create cal_User for organizer
      const userRecords = result.filter(r => r.model === 'cal_User');
      expect(userRecords.length).toBeGreaterThanOrEqual(1);
      
      const organizerUser = userRecords.find(r => r.record.email === 'organizer@company.com');
      expect(organizerUser).toBeDefined();
      
      // Event should reference organizer
      const eventRecords = result.filter(r => r.model === 'cal_Event');
      expect(eventRecords).toHaveLength(1);
      expect(eventRecords[0].record.organizer).toMatchObject({
        uid: 'organizer@company.com',
        source: 'Office365Calendar'
      });
    });
  });

  describe('Status and Response Mapping', () => {
    test('should map Office 365 response statuses to Faros categories', async () => {
      const testCases = [
        { responseStatus: 'accepted', expectedCategory: 'Accepted' },
        { responseStatus: 'declined', expectedCategory: 'Canceled' },
        { responseStatus: 'tentative', expectedCategory: 'Tentative' },
        { responseStatus: 'needsAction', expectedCategory: 'NeedsAction' },
        { responseStatus: 'unknown', expectedCategory: 'Custom' }
      ];

      for (const testCase of testCases) {
        const event = AirbyteRecord.make('events', {
          id: `event-${testCase.responseStatus}`,
          summary: 'Test Event',
          attendees: [{
            email: 'test@company.com',
            displayName: 'Test User',
            responseStatus: testCase.responseStatus,
            optional: false
          }],
          calendarId: 'test-calendar-1'
        });

        const result = await converter.convert(event, mockStreamContext);
        const associations = result.filter(r => r.model === 'cal_EventGuestAssociation');
        
        expect(associations).toHaveLength(1);
        expect(associations[0].record.status.category).toBe(testCase.expectedCategory);
      }
    });

    test('should map Office 365 event statuses correctly', async () => {
      const statusTestCases = [
        { status: 'confirmed', expectedCategory: 'Confirmed' },
        { status: 'cancelled', expectedCategory: 'Canceled' },
        { status: 'tentative', expectedCategory: 'Tentative' }
      ];

      for (const testCase of statusTestCases) {
        const event = AirbyteRecord.make('events', {
          id: `event-status-${testCase.status}`,
          summary: 'Status Test Event',
          status: testCase.status,
          calendarId: 'test-calendar-1'
        });

        const result = await converter.convert(event, mockStreamContext);
        const eventRecords = result.filter(r => r.model === 'cal_Event');
        
        expect(eventRecords).toHaveLength(1);
        expect(eventRecords[0].record.status.category).toBe(testCase.expectedCategory);
      }
    });
  });

  describe('Date and Time Processing', () => {
    test('should calculate duration correctly for timed events', async () => {
      const timedEvent = AirbyteRecord.make('events', {
        id: 'timed-event',
        summary: 'One Hour Meeting',
        start: {
          dateTime: '2023-01-02T09:00:00.000Z',
          timeZone: 'America/New_York'
        },
        end: {
          dateTime: '2023-01-02T10:00:00.000Z',
          timeZone: 'America/New_York'
        },
        calendarId: 'test-calendar-1'
      });

      const result = await converter.convert(timedEvent, mockStreamContext);
      const eventRecords = result.filter(r => r.model === 'cal_Event');
      
      expect(eventRecords).toHaveLength(1);
      expect(eventRecords[0].record.durationMs).toBe(3600000); // 1 hour in milliseconds
    });

    test('should handle timezone information correctly', async () => {
      const timezoneEvent = AirbyteRecord.make('events', {
        id: 'timezone-event',
        summary: 'Timezone Test',
        start: {
          dateTime: '2023-01-02T14:00:00.000Z',
          timeZone: 'Europe/London'
        },
        end: {
          dateTime: '2023-01-02T15:00:00.000Z',
          timeZone: 'Europe/London'
        },
        calendarId: 'test-calendar-1'
      });

      const result = await converter.convert(timezoneEvent, mockStreamContext);
      const eventRecords = result.filter(r => r.model === 'cal_Event');
      
      expect(eventRecords).toHaveLength(1);
      expect(eventRecords[0].record.timeZone).toBe('Europe/London');
    });
  });

  describe('Conference URL Processing', () => {
    test('should extract Microsoft Teams URLs from location field', async () => {
      const teamsEvent = AirbyteRecord.make('events', {
        id: 'teams-event',
        summary: 'Teams Meeting',
        location: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abcd1234',
        calendarId: 'test-calendar-1'
      });

      const result = await converter.convert(teamsEvent, mockStreamContext);
      const eventRecords = result.filter(r => r.model === 'cal_Event');
      
      expect(eventRecords).toHaveLength(1);
      expect(eventRecords[0].record.conferenceUrl).toBe('https://teams.microsoft.com/l/meetup-join/19%3ameeting_abcd1234');
    });

    test('should extract Zoom URLs from location field', async () => {
      const zoomEvent = AirbyteRecord.make('events', {
        id: 'zoom-event',
        summary: 'Zoom Meeting',
        location: 'https://zoom.us/j/1234567890?pwd=abcdef',
        calendarId: 'test-calendar-1'
      });

      const result = await converter.convert(zoomEvent, mockStreamContext);
      const eventRecords = result.filter(r => r.model === 'cal_Event');
      
      expect(eventRecords).toHaveLength(1);
      expect(eventRecords[0].record.conferenceUrl).toBe('https://zoom.us/j/1234567890?pwd=abcdef');
    });

    test('should not treat physical locations as conference URLs', async () => {
      const physicalEvent = AirbyteRecord.make('events', {
        id: 'physical-event',
        summary: 'In-Person Meeting',
        location: 'Conference Room A, Building 1',
        calendarId: 'test-calendar-1'
      });

      const result = await converter.convert(physicalEvent, mockStreamContext);
      const eventRecords = result.filter(r => r.model === 'cal_Event');
      
      expect(eventRecords).toHaveLength(1);
      expect(eventRecords[0].record.conferenceUrl).toBeUndefined();
      
      // Location should be processed for geographic resolution
      // Location records are returned by onProcessingComplete
      const locationRecords = await converter.onProcessingComplete(mockStreamContext);
      expect(locationRecords.some(r => r.model.startsWith('geo_'))).toBe(true);
    });
  });

  describe('User Deduplication', () => {
    test('should deduplicate users across multiple events', async () => {
      const sharedUser = {
        email: 'shared@company.com',
        displayName: 'Shared User',
        responseStatus: 'accepted',
        optional: false
      };

      const event1 = AirbyteRecord.make('events', {
        id: 'event-1',
        summary: 'First Event',
        attendees: [sharedUser],
        calendarId: 'test-calendar-1'
      });

      const event2 = AirbyteRecord.make('events', {
        id: 'event-2', 
        summary: 'Second Event',
        attendees: [sharedUser],
        calendarId: 'test-calendar-1'
      });

      // Process both events with the same converter instance
      const result1 = await converter.convert(event1, mockStreamContext);
      const result2 = await converter.convert(event2, mockStreamContext);

      // First event should create the user
      const users1 = result1.filter(r => r.model === 'cal_User');
      expect(users1).toHaveLength(1);

      // Second event should not create duplicate user
      const users2 = result2.filter(r => r.model === 'cal_User');
      expect(users2).toHaveLength(0); // User already created
      
      // But should still create guest association
      const associations2 = result2.filter(r => r.model === 'cal_EventGuestAssociation');
      expect(associations2).toHaveLength(1);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle events with missing optional fields', async () => {
      const minimalEvent = AirbyteRecord.make('events', {
        id: 'minimal-event',
        summary: 'Minimal Event',
        calendarId: 'test-calendar-1'
        // Missing: description, location, attendees, times, etc.
      });

      const result = await converter.convert(minimalEvent, mockStreamContext);
      
      // Should still create an event record
      const eventRecords = result.filter(r => r.model === 'cal_Event');
      expect(eventRecords).toHaveLength(1);
      
      expect(eventRecords[0].record).toMatchObject({
        uid: 'minimal-event',
        title: 'Minimal Event',
        calendar: {
          uid: 'test-calendar-1',
          source: 'Office365Calendar'
        }
      });
    });

    test('should handle malformed attendee data gracefully', async () => {
      const eventWithBadAttendees = AirbyteRecord.make('events', {
        id: 'bad-attendees-event',
        summary: 'Event with Bad Attendees',
        attendees: [
          {
            // Missing email
            displayName: 'No Email User',
            responseStatus: 'accepted',
            optional: false
          },
          {
            email: 'valid@company.com',
            displayName: 'Valid User',
            responseStatus: 'accepted',
            optional: false
          }
        ],
        calendarId: 'test-calendar-1'
      });

      const result = await converter.convert(eventWithBadAttendees, mockStreamContext);
      
      // Should create user only for valid attendee
      const userRecords = result.filter(r => r.model === 'cal_User');
      expect(userRecords).toHaveLength(1);
      expect(userRecords[0].record.email).toBe('valid@company.com');
      
      // Should create association only for valid attendee
      const associations = result.filter(r => r.model === 'cal_EventGuestAssociation');
      expect(associations).toHaveLength(1);
    });

    test('should handle events without calendar ID', async () => {
      const eventWithoutCalendar = AirbyteRecord.make('events', {
        id: 'no-calendar-event',
        summary: 'Event Without Calendar'
        // Missing calendarId
      });

      // Should not throw an error
      expect(async () => {
        await converter.convert(eventWithoutCalendar, mockStreamContext);
      }).not.toThrow();
    });
  });
});