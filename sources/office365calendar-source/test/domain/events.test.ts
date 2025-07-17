import {
  Event,
  NormalEvent,
  DeletedEvent,
  EventDateTime,
  Attendee,
  AttendeeStatus,
  EventStatus,
  EventType,
  createNormalEvent,
  createDeletedEvent,
  createEventDateTime,
  createAttendee,
  isNormalEvent,
  isDeletedEvent,
  mapEvent,
  filterActiveEvents,
  eventEquals,
  serializeEvent,
  deserializeEvent
} from '../../src/domain/events';
import { 
  EventId,
  CalendarId,
  UserId,
  Timestamp,
  createEventId, 
  createCalendarId, 
  createUserId, 
  createTimestamp 
} from '../../src/domain/types';

describe('Event Discriminated Unions - Zero Invalid States', () => {
  // Test data setup
  const eventId = createEventId('event_123');
  const calendarId = createCalendarId('calendar_456');
  const userId = createUserId('user_789');
  const now = createTimestamp(Date.now());
  
  const startTime = createEventDateTime(
    createTimestamp(Date.now() + 3600000),
    'UTC'
  );
  const endTime = createEventDateTime(
    createTimestamp(Date.now() + 7200000),
    'UTC'
  );
  
  const attendee = createAttendee(
    userId,
    'john.doe@example.com',
    'John Doe',
    AttendeeStatus.ACCEPTED
  );

  describe('Event Construction', () => {
    test('should create normal events with all required fields', () => {
      const event = createNormalEvent({
        id: eventId,
        calendarId,
        lastModified: now,
        subject: 'Team Meeting',
        start: startTime,
        end: endTime,
        attendees: [attendee],
        status: EventStatus.CONFIRMED,
        isAllDay: false,
        location: 'Conference Room A',
        description: 'Weekly team sync',
        organizer: userId
      });
      
      expect(event.type).toBe(EventType.NORMAL);
      expect(event.id).toBe(eventId);
      expect(event.subject).toBe('Team Meeting');
      expect(event.attendees).toHaveLength(1);
      expect(isNormalEvent(event)).toBe(true);
      expect(isDeletedEvent(event)).toBe(false);
    });

    test('should create deleted events with deletion metadata', () => {
      const deletedEvent = createDeletedEvent({
        id: eventId,
        calendarId,
        lastModified: now,
        deletedAt: now,
        reason: 'user_deleted',
        originalSubject: 'Cancelled Meeting'
      });
      
      expect(deletedEvent.type).toBe(EventType.DELETED);
      expect(deletedEvent.id).toBe(eventId);
      expect(deletedEvent.reason).toBe('user_deleted');
      expect(deletedEvent.originalSubject).toBe('Cancelled Meeting');
      expect(isDeletedEvent(deletedEvent)).toBe(true);
      expect(isNormalEvent(deletedEvent)).toBe(false);
    });

    test('should prevent invalid event state combinations', () => {
      // Cannot create a normal event without required fields
      expect(() => createNormalEvent({
        id: eventId,
        calendarId,
        lastModified: now,
        subject: '',  // Empty subject should fail
        start: startTime,
        end: endTime,
        attendees: [],
        status: EventStatus.CONFIRMED,
        isAllDay: false
      })).toThrow('Subject cannot be empty');

      // Cannot create deleted event without deletion reason
      expect(() => createDeletedEvent({
        id: eventId,
        calendarId,
        lastModified: now,
        deletedAt: now,
        reason: '' as any  // Empty reason should fail
      })).toThrow('Deletion reason cannot be empty');
    });
  });

  describe('Type Guards', () => {
    test('should distinguish between normal and deleted events', () => {
      const normalEvent = createNormalEvent({
        id: eventId,
        calendarId,
        lastModified: now,
        subject: 'Normal Meeting',
        start: startTime,
        end: endTime,
        attendees: [attendee],
        status: EventStatus.CONFIRMED,
        isAllDay: false
      });
      
      const deletedEvent = createDeletedEvent({
        id: createEventId('deleted_event'),
        calendarId,
        lastModified: now,
        deletedAt: now,
        reason: 'calendar_deleted'
      });
      
      // Type guards should work correctly
      expect(isNormalEvent(normalEvent)).toBe(true);
      expect(isDeletedEvent(normalEvent)).toBe(false);
      
      expect(isNormalEvent(deletedEvent)).toBe(false);
      expect(isDeletedEvent(deletedEvent)).toBe(true);
    });

    test('should enable exhaustive pattern matching', () => {
      const normalEvent = createNormalEvent({
        id: eventId,
        calendarId,
        lastModified: now,
        subject: 'Test Meeting',
        start: startTime,
        end: endTime,
        attendees: [],
        status: EventStatus.CONFIRMED,
        isAllDay: false
      });
      
      const deletedEvent = createDeletedEvent({
        id: createEventId('deleted_event'),
        calendarId,
        lastModified: now,
        deletedAt: now,
        reason: 'user_deleted'
      });
      
      // Exhaustive pattern matching function
      const getEventSummary = (event: Event): string => {
        switch (event.type) {
          case EventType.NORMAL:
            return `Normal: ${event.subject}`;
          case EventType.DELETED:
            return `Deleted: ${event.originalSubject || 'Unknown'}`;
          default:
            // TypeScript should catch this as unreachable
            const _exhaustive: never = event;
            throw new Error(`Unhandled event type: ${_exhaustive}`);
        }
      };
      
      expect(getEventSummary(normalEvent)).toBe('Normal: Test Meeting');
      expect(getEventSummary(deletedEvent)).toBe('Deleted: Unknown');
    });
  });

  describe('Event Operations', () => {
    test('should map over events preserving type safety', () => {
      const normalEvent = createNormalEvent({
        id: eventId,
        calendarId,
        lastModified: now,
        subject: 'Original Subject',
        start: startTime,
        end: endTime,
        attendees: [],
        status: EventStatus.CONFIRMED,
        isAllDay: false
      });
      
      const mappedEvent = mapEvent(normalEvent, (event) => {
        if (isNormalEvent(event)) {
          return createNormalEvent({
            ...event,
            subject: event.subject.toUpperCase()
          });
        }
        return event; // Deleted events unchanged
      });
      
      expect(isNormalEvent(mappedEvent)).toBe(true);
      if (isNormalEvent(mappedEvent)) {
        expect(mappedEvent.subject).toBe('ORIGINAL SUBJECT');
      }
    });

    test('should filter active events correctly', () => {
      const normalEvent = createNormalEvent({
        id: eventId,
        calendarId,
        lastModified: now,
        subject: 'Active Meeting',
        start: startTime,
        end: endTime,
        attendees: [],
        status: EventStatus.CONFIRMED,
        isAllDay: false
      });
      
      const deletedEvent = createDeletedEvent({
        id: createEventId('deleted_event'),
        calendarId,
        lastModified: now,
        deletedAt: now,
        reason: 'user_deleted'
      });
      
      const events: Event[] = [normalEvent, deletedEvent];
      const activeEvents = filterActiveEvents(events);
      
      expect(activeEvents).toHaveLength(1);
      expect(activeEvents[0]).toBe(normalEvent);
    });
  });

  describe('Event Equality', () => {
    test('should compare events by ID and type', () => {
      const event1 = createNormalEvent({
        id: eventId,
        calendarId,
        lastModified: now,
        subject: 'Meeting 1',
        start: startTime,
        end: endTime,
        attendees: [],
        status: EventStatus.CONFIRMED,
        isAllDay: false
      });
      
      const event2 = createNormalEvent({
        id: eventId, // Same ID
        calendarId,
        lastModified: now,
        subject: 'Meeting 2', // Different subject
        start: startTime,
        end: endTime,
        attendees: [],
        status: EventStatus.CONFIRMED,
        isAllDay: false
      });
      
      const event3 = createDeletedEvent({
        id: eventId, // Same ID but different type
        calendarId,
        lastModified: now,
        deletedAt: now,
        reason: 'user_deleted'
      });
      
      expect(eventEquals(event1, event2)).toBe(true); // Same ID, same type
      expect(eventEquals(event1, event3)).toBe(false); // Same ID, different type
    });
  });

  describe('Serialization', () => {
    test('should serialize and deserialize normal events', () => {
      const event = createNormalEvent({
        id: eventId,
        calendarId,
        lastModified: now,
        subject: 'Serialization Test',
        start: startTime,
        end: endTime,
        attendees: [attendee],
        status: EventStatus.CONFIRMED,
        isAllDay: false,
        location: 'Virtual',
        description: 'Test event'
      });
      
      const serialized = serializeEvent(event);
      const deserialized = deserializeEvent(serialized);
      
      expect(deserialized.type).toBe(EventType.NORMAL);
      expect(eventEquals(event, deserialized)).toBe(true);
      
      if (isNormalEvent(deserialized)) {
        expect(deserialized.subject).toBe('Serialization Test');
        expect(deserialized.attendees).toHaveLength(1);
      }
    });

    test('should serialize and deserialize deleted events', () => {
      const event = createDeletedEvent({
        id: eventId,
        calendarId,
        lastModified: now,
        deletedAt: now,
        reason: 'system_cleanup',
        originalSubject: 'Deleted Meeting'
      });
      
      const serialized = serializeEvent(event);
      const deserialized = deserializeEvent(serialized);
      
      expect(deserialized.type).toBe(EventType.DELETED);
      expect(eventEquals(event, deserialized)).toBe(true);
      
      if (isDeletedEvent(deserialized)) {
        expect(deserialized.reason).toBe('system_cleanup');
        expect(deserialized.originalSubject).toBe('Deleted Meeting');
      }
    });
  });

  describe('EventDateTime and Attendee Types', () => {
    test('should create and validate EventDateTime', () => {
      const dateTime = createEventDateTime(now, 'America/New_York');
      
      expect(dateTime.timestamp).toBe(now);
      expect(dateTime.timeZone).toBe('America/New_York');
      expect(dateTime.toISOString()).toBe(now.toISOString());
    });

    test('should create and validate Attendee', () => {
      const attendee = createAttendee(
        userId,
        'test@example.com',
        'Test User',
        AttendeeStatus.TENTATIVE
      );
      
      expect(attendee.userId).toBe(userId);
      expect(attendee.email).toBe('test@example.com');
      expect(attendee.displayName).toBe('Test User');
      expect(attendee.status).toBe(AttendeeStatus.TENTATIVE);
    });

    test('should validate attendee email format', () => {
      expect(() => createAttendee(
        userId,
        'invalid-email',
        'Test User',
        AttendeeStatus.ACCEPTED
      )).toThrow('Invalid email format');
    });

    test('should validate timezone format', () => {
      expect(() => createEventDateTime(
        now,
        'Not-A-Valid-Format'  // No slash, should fail
      )).toThrow('Invalid timezone format');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty attendee lists', () => {
      const event = createNormalEvent({
        id: eventId,
        calendarId,
        lastModified: now,
        subject: 'No Attendees',
        start: startTime,
        end: endTime,
        attendees: [], // Empty array is valid
        status: EventStatus.CONFIRMED,
        isAllDay: false
      });
      
      expect(event.attendees).toHaveLength(0);
    });

    test('should validate event time ordering', () => {
      const laterTime = createEventDateTime(
        createTimestamp(Date.now() + 10800000),
        'UTC'
      );
      
      expect(() => createNormalEvent({
        id: eventId,
        calendarId,
        lastModified: now,
        subject: 'Invalid Time Order',
        start: laterTime,  // Start after end
        end: startTime,    // End before start
        attendees: [],
        status: EventStatus.CONFIRMED,
        isAllDay: false
      })).toThrow('Event start time must be before end time');
    });

    test('should handle all-day events correctly', () => {
      const allDayEvent = createNormalEvent({
        id: eventId,
        calendarId,
        lastModified: now,
        subject: 'All Day Event',
        start: startTime,
        end: endTime,
        attendees: [],
        status: EventStatus.CONFIRMED,
        isAllDay: true
      });
      
      expect(allDayEvent.isAllDay).toBe(true);
    });
  });

  describe('Immutability', () => {
    test('should create immutable event objects', () => {
      const event = createNormalEvent({
        id: eventId,
        calendarId,
        lastModified: now,
        subject: 'Immutable Event',
        start: startTime,
        end: endTime,
        attendees: [attendee],
        status: EventStatus.CONFIRMED,
        isAllDay: false
      });
      
      // Should throw when trying to modify frozen object
      expect(() => {
        (event as any).subject = 'Modified';
      }).toThrow();
      
      // Should throw when trying to modify attendees array
      expect(() => {
        (event as any).attendees.push(attendee);
      }).toThrow();
    });
  });
});