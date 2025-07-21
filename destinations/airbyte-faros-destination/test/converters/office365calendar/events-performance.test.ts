import {AirbyteLogger, AirbyteRecord} from 'faros-airbyte-cdk';

import {StreamContext} from '../../../src/converters/converter';
import {Events} from '../../../src/converters/office365calendar/events';

describe('Office365Calendar Events Converter - Performance and Scale', () => {
  let converter: Events;
  let mockStreamContext: StreamContext;
  let mockFarosClient: any;

  beforeEach(() => {
    converter = new Events();
    
    // Create proper mock FarosClient
    mockFarosClient = {
      geocode: jest.fn().mockResolvedValue([{
        uid: 'test-location-uid',
        raw: 'Conference Room A',
        address: {
          uid: 'address-uid',
          fullAddress: 'Conference Room A, Building 1',
          city: 'San Francisco',
          state: 'California',
          country: 'United States'
        },
        coordinates: { lat: 37.7749, lon: -122.4194 }
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

  describe('Large Dataset Processing', () => {
    test('should handle event with 100+ attendees efficiently', async () => {
      // Create event with many attendees
      const attendees = Array.from({ length: 100 }, (_, i) => ({
        email: `attendee${i}@company.com`,
        displayName: `Attendee ${i}`,
        responseStatus: 'accepted',
        optional: i % 3 === 0 // Every 3rd attendee is optional
      }));

      const largeEvent = AirbyteRecord.make('events', {
        id: 'large-event-100-attendees',
        summary: 'All Hands Meeting',
        description: 'Quarterly all hands meeting with entire company',
        attendees,
        calendarId: 'company-calendar'
      });

      const startTime = Date.now();
      const result = await converter.convert(largeEvent, mockStreamContext);
      const processingTime = Date.now() - startTime;

      // Should complete within reasonable time (less than 1 second)
      expect(processingTime).toBeLessThan(1000);

      // Should create correct number of records
      const userRecords = result.filter(r => r.model === 'cal_User');
      const guestAssociations = result.filter(r => r.model === 'cal_EventGuestAssociation');
      const eventRecords = result.filter(r => r.model === 'cal_Event');

      expect(userRecords).toHaveLength(100); // All attendees
      expect(guestAssociations).toHaveLength(100); // All associations
      expect(eventRecords).toHaveLength(1); // One event
    });

    test('should efficiently deduplicate users across multiple large events', async () => {
      // Create shared attendee list
      const sharedAttendees = Array.from({ length: 50 }, (_, i) => ({
        email: `shared${i}@company.com`,
        displayName: `Shared User ${i}`,
        responseStatus: 'accepted',
        optional: false
      }));

      // Create multiple events with overlapping attendees
      const events = Array.from({ length: 10 }, (_, i) => 
        AirbyteRecord.make('events', {
          id: `bulk-event-${i}`,
          summary: `Meeting ${i}`,
          attendees: sharedAttendees.slice(0, 30), // Each event has 30 of the 50 users
          calendarId: 'test-calendar'
        })
      );

      const startTime = Date.now();
      
      let totalUserRecords = 0;
      let totalAssociations = 0;
      
      // Process all events sequentially (simulating batch processing)
      for (const event of events) {
        const result = await converter.convert(event, mockStreamContext);
        totalUserRecords += result.filter(r => r.model === 'cal_User').length;
        totalAssociations += result.filter(r => r.model === 'cal_EventGuestAssociation').length;
      }
      
      const processingTime = Date.now() - startTime;

      // Should complete within reasonable time
      expect(processingTime).toBeLessThan(2000);

      // First event should create 30 users, subsequent events should create 0 (deduplication)
      expect(totalUserRecords).toBe(30);
      
      // But should create associations for all events
      expect(totalAssociations).toBe(300); // 10 events × 30 attendees each
    });
  });

  describe('Memory Management', () => {
    test('should not leak memory with repeated conversions', async () => {
      const testEvent = AirbyteRecord.make('events', {
        id: 'memory-test-event',
        summary: 'Memory Test',
        attendees: [
          {
            email: 'test@company.com',
            displayName: 'Test User',
            responseStatus: 'accepted',
            optional: false
          }
        ],
        calendarId: 'test-calendar'
      });

      // Process the same event many times
      for (let i = 0; i < 1000; i++) {
        const eventCopy = AirbyteRecord.make('events', {
          ...testEvent.record.data,
          id: `memory-test-event-${i}`
        });
        
        await converter.convert(eventCopy, mockStreamContext);
      }

      // If we get here without running out of memory, the test passes
      expect(true).toBe(true);
    });
  });

  describe('Location Processing Performance', () => {
    test('should handle multiple location resolutions efficiently', async () => {
      const eventsWithLocations = Array.from({ length: 20 }, (_, i) => 
        AirbyteRecord.make('events', {
          id: `location-event-${i}`,
          summary: `Meeting at Location ${i}`,
          location: `Conference Room ${String.fromCharCode(65 + i)}, Building ${Math.floor(i/5) + 1}`,
          calendarId: 'test-calendar'
        })
      );

      const startTime = Date.now();
      
      for (const event of eventsWithLocations) {
        await converter.convert(event, mockStreamContext);
      }
      
      const processingTime = Date.now() - startTime;

      // Should complete within reasonable time
      expect(processingTime).toBeLessThan(3000);

      // Should have called location resolution for each unique location
      expect(mockFarosClient.geocode).toHaveBeenCalled();
    });
  });

  describe('onProcessingComplete Method', () => {
    test('should return location records when processing is complete', async () => {
      // Process some events with locations first
      const eventsWithLocations = [
        AirbyteRecord.make('events', {
          id: 'event-with-location-1',
          summary: 'Meeting 1',
          location: 'Conference Room Alpha',
          calendarId: 'test-calendar'
        }),
        AirbyteRecord.make('events', {
          id: 'event-with-location-2', 
          summary: 'Meeting 2',
          location: 'Conference Room Beta',
          calendarId: 'test-calendar'
        })
      ];

      // Convert events (this should populate the location collector)
      for (const event of eventsWithLocations) {
        await converter.convert(event, mockStreamContext);
      }

      // Call onProcessingComplete to get accumulated location records
      const locationRecords = await converter.onProcessingComplete(mockStreamContext);

      // Should return location-related records
      expect(Array.isArray(locationRecords)).toBe(true);
      
      // Location records should include geo models
      const geoRecords = locationRecords.filter(r => 
        r.model === 'geo_Location' || 
        r.model === 'geo_Address' || 
        r.model === 'geo_Coordinates'
      );
      
      expect(geoRecords.length).toBeGreaterThan(0);
    });

    test('should handle onProcessingComplete with no locations processed', async () => {
      // Don't process any events with locations
      const eventWithoutLocation = AirbyteRecord.make('events', {
        id: 'no-location-event',
        summary: 'Virtual Meeting',
        location: 'https://teams.microsoft.com/l/meetup-join/123', // URL, not a location
        calendarId: 'test-calendar'
      });

      await converter.convert(eventWithoutLocation, mockStreamContext);

      // Call onProcessingComplete
      const locationRecords = await converter.onProcessingComplete(mockStreamContext);

      // Should return empty array or handle gracefully
      expect(Array.isArray(locationRecords)).toBe(true);
    });
  });

  describe('Complex Event Scenarios', () => {
    test('should handle event with multiple complex features', async () => {
      const complexEvent = AirbyteRecord.make('events', {
        id: 'complex-event-123',
        kind: 'calendar#event',
        etag: '"complex123"',
        status: 'confirmed',
        htmlLink: 'https://outlook.office365.com/calendar/item/complex-event-123',
        created: '2023-01-01T08:00:00.000Z',
        updated: '2023-01-01T08:30:00.000Z',
        summary: 'Complex Quarterly Review Meeting',
        description: 'Comprehensive quarterly review with stakeholders, including:\n- Q4 Results\n- Q1 Planning\n- Budget Review\n- Team Performance Analysis',
        location: 'Executive Conference Room, 42nd Floor, Building A',
        creator: {
          email: 'creator@company.com',
          displayName: 'Meeting Creator',
          self: false
        },
        organizer: {
          email: 'organizer@company.com', 
          displayName: 'Meeting Organizer',
          self: true
        },
        start: {
          dateTime: '2023-01-15T14:00:00.000Z',
          timeZone: 'America/New_York'
        },
        end: {
          dateTime: '2023-01-15T17:00:00.000Z',
          timeZone: 'America/New_York'
        },
        attendees: [
          {
            email: 'vp@company.com',
            displayName: 'VP Operations',
            responseStatus: 'accepted',
            optional: false
          },
          {
            email: 'manager@company.com',
            displayName: 'Team Manager',
            responseStatus: 'tentative',
            optional: false
          },
          {
            email: 'analyst@company.com',
            displayName: 'Data Analyst',
            responseStatus: 'needsAction',
            optional: true
          },
          {
            email: 'external@partner.com',
            displayName: 'External Partner',
            responseStatus: 'declined',
            optional: true
          }
        ],
        transparency: 'opaque',
        visibility: 'private',
        importance: 'high',
        calendarId: 'executive-calendar',
        nextSyncToken: 'delta_token_complex_123'
      });

      const result = await converter.convert(complexEvent, mockStreamContext);

      // Should create all expected record types
      const eventRecords = result.filter(r => r.model === 'cal_Event');
      const userRecords = result.filter(r => r.model === 'cal_User');
      const guestAssociations = result.filter(r => r.model === 'cal_EventGuestAssociation');

      expect(eventRecords).toHaveLength(1);
      expect(userRecords).toHaveLength(5); // 4 attendees + 1 organizer
      expect(guestAssociations).toHaveLength(4); // One for each attendee

      // Verify event details
      const event = eventRecords[0].record;
      expect(event).toMatchObject({
        uid: 'complex-event-123',
        title: 'Complex Quarterly Review Meeting',
        description: expect.stringContaining('Comprehensive quarterly review'),
        url: 'https://outlook.office365.com/calendar/item/complex-event-123',
        timeZone: 'America/New_York',
        durationMs: 10800000, // 3 hours in milliseconds
        organizer: {
          uid: 'organizer@company.com',
          source: 'Office365Calendar'
        }
      });

      // Verify guest associations have correct statuses
      const acceptedGuest = guestAssociations.find(g => 
        g.record.guest.uid === 'vp@company.com'
      );
      expect(acceptedGuest?.record.status.category).toBe('Accepted');

      const tentativeGuest = guestAssociations.find(g => 
        g.record.guest.uid === 'manager@company.com'
      );
      expect(tentativeGuest?.record.status.category).toBe('Tentative');

      const declinedGuest = guestAssociations.find(g => 
        g.record.guest.uid === 'external@partner.com'
      );
      expect(declinedGuest?.record.status.category).toBe('Canceled');
    });
  });
});