/**
 * Event Discriminated Unions - Enterprise-Grade Type Safety for Calendar Events
 * 
 * This module implements discriminated unions to represent different event states
 * in a type-safe manner. Invalid states are impossible to represent at compile-time,
 * following the principle of "make invalid states unrepresentable."
 * 
 * Key Features:
 * - Exhaustive pattern matching prevents missing cases
 * - Type guards enable safe runtime type checking
 * - Immutable event objects prevent accidental mutation
 * - Comprehensive validation ensures data integrity
 * 
 * @example
 * ```typescript
 * const event = createNormalEvent({
 *   id: eventId,
 *   subject: 'Team Meeting',
 *   start: startTime,
 *   end: endTime,
 *   // ... other fields
 * });
 * 
 * // Exhaustive pattern matching
 * const summary = match(event, {
 *   normal: (e) => `Meeting: ${e.subject}`,
 *   deleted: (e) => `Deleted: ${e.originalSubject || 'Unknown'}`
 * });
 * ```
 */

import { EventId, CalendarId, UserId, Timestamp } from './types';

/**
 * Event type discriminator for exhaustive pattern matching
 */
export enum EventType {
  NORMAL = 'normal',
  DELETED = 'deleted'
}

/**
 * Event status enumeration based on RFC 5545 (iCalendar)
 */
export enum EventStatus {
  TENTATIVE = 'tentative',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled'
}

/**
 * Attendee response status
 */
export enum AttendeeStatus {
  NEEDS_ACTION = 'needsAction',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  TENTATIVE = 'tentative'
}

/**
 * Deletion reason for tracking why events were removed
 */
export type DeletionReason = 
  | 'user_deleted'
  | 'calendar_deleted'
  | 'system_cleanup'
  | 'expired'
  | 'cancelled_by_organizer';

/**
 * Date and time representation with timezone information
 */
export interface EventDateTime {
  readonly timestamp: Timestamp;
  readonly timeZone: string;
  toISOString(): string;
  toDate(): Date;
}

/**
 * Event attendee with contact information and status
 */
export interface Attendee {
  readonly userId: UserId;
  readonly email: string;
  readonly displayName: string;
  readonly status: AttendeeStatus;
  readonly isOptional?: boolean | undefined;
  readonly responseTime?: Timestamp | undefined;
}

/**
 * Base interface for all event types containing common fields
 */
interface BaseEvent {
  readonly id: EventId;
  readonly calendarId: CalendarId;
  readonly lastModified: Timestamp;
  readonly type: EventType;
}

/**
 * Normal (active) event with full meeting details
 */
export interface NormalEvent extends BaseEvent {
  readonly type: EventType.NORMAL;
  readonly subject: string;
  readonly start: EventDateTime;
  readonly end: EventDateTime;
  readonly attendees: readonly Attendee[];
  readonly status: EventStatus;
  readonly isAllDay: boolean;
  readonly location?: string | undefined;
  readonly description?: string | undefined;
  readonly organizer?: UserId | undefined;
  readonly recurrenceRule?: string | undefined;
  readonly categories?: readonly string[] | undefined;
  readonly sensitivity?: 'normal' | 'private' | 'confidential' | undefined;
}

/**
 * Deleted event with metadata about the deletion
 */
export interface DeletedEvent extends BaseEvent {
  readonly type: EventType.DELETED;
  readonly deletedAt: Timestamp;
  readonly reason: DeletionReason;
  readonly originalSubject?: string | undefined;
  readonly originalStart?: EventDateTime | undefined;
  readonly originalEnd?: EventDateTime | undefined;
  readonly deletedBy?: UserId | undefined;
}

/**
 * Discriminated union of all possible event states
 */
export type Event = NormalEvent | DeletedEvent;

/**
 * Validation helper for email addresses
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Basic timezone validation (simplified - in production, use a proper timezone library)
 * Accepts common formats like America/New_York, UTC, GMT+05:00, etc.
 * Rejects clearly invalid formats
 */
const TIMEZONE_PATTERN = /^(UTC|GMT[+-]\d{2}:\d{2}|[A-Za-z]+\/[A-Za-z_]+)$/;

/**
 * Internal implementation of EventDateTime
 */
class EventDateTimeImpl implements EventDateTime {
  readonly timestamp: Timestamp;
  readonly timeZone: string;

  constructor(timestamp: Timestamp, timeZone: string) {
    if (!TIMEZONE_PATTERN.test(timeZone)) {
      throw new Error(`Invalid timezone format: ${timeZone}`);
    }
    
    this.timestamp = timestamp;
    this.timeZone = timeZone;
    
    // Freeze for immutability
    Object.freeze(this);
  }

  toISOString(): string {
    return this.timestamp.toISOString();
  }

  toDate(): Date {
    return this.timestamp.toDate();
  }
}

/**
 * Internal implementation of Attendee
 */
class AttendeeImpl implements Attendee {
  readonly userId: UserId;
  readonly email: string;
  readonly displayName: string;
  readonly status: AttendeeStatus;
  readonly isOptional?: boolean | undefined;
  readonly responseTime?: Timestamp | undefined;

  constructor(
    userId: UserId,
    email: string,
    displayName: string,
    status: AttendeeStatus,
    isOptional?: boolean,
    responseTime?: Timestamp
  ) {
    // Validation
    if (!EMAIL_PATTERN.test(email)) {
      throw new Error(`Invalid email format: ${email}`);
    }
    
    if (displayName.trim().length === 0) {
      throw new Error('Display name cannot be empty');
    }
    
    this.userId = userId;
    this.email = email;
    this.displayName = displayName.trim();
    this.status = status;
    this.isOptional = isOptional;
    this.responseTime = responseTime;
    
    // Freeze for immutability
    Object.freeze(this);
  }
}

/**
 * Internal implementation of NormalEvent
 */
class NormalEventImpl implements NormalEvent {
  readonly type = EventType.NORMAL;
  readonly id: EventId;
  readonly calendarId: CalendarId;
  readonly lastModified: Timestamp;
  readonly subject: string;
  readonly start: EventDateTime;
  readonly end: EventDateTime;
  readonly attendees: readonly Attendee[];
  readonly status: EventStatus;
  readonly isAllDay: boolean;
  readonly location?: string | undefined;
  readonly description?: string | undefined;
  readonly organizer?: UserId | undefined;
  readonly recurrenceRule?: string | undefined;
  readonly categories?: readonly string[] | undefined;
  readonly sensitivity?: 'normal' | 'private' | 'confidential' | undefined;

  constructor(config: Omit<NormalEvent, 'type'>) {
    // Validation
    if (config.subject.trim().length === 0) {
      throw new Error('Subject cannot be empty');
    }
    
    if (!config.isAllDay && config.start.timestamp.isAfter(config.end.timestamp)) {
      throw new Error('Event start time must be before end time');
    }
    
    this.id = config.id;
    this.calendarId = config.calendarId;
    this.lastModified = config.lastModified;
    this.subject = config.subject.trim();
    this.start = config.start;
    this.end = config.end;
    this.attendees = Object.freeze([...config.attendees]); // Deep freeze attendees array
    this.status = config.status;
    this.isAllDay = config.isAllDay;
    this.location = config.location?.trim();
    this.description = config.description?.trim();
    this.organizer = config.organizer;
    this.recurrenceRule = config.recurrenceRule;
    this.categories = config.categories ? Object.freeze([...config.categories]) : undefined;
    this.sensitivity = config.sensitivity;
    
    // Freeze for immutability
    Object.freeze(this);
  }
}

/**
 * Internal implementation of DeletedEvent
 */
class DeletedEventImpl implements DeletedEvent {
  readonly type = EventType.DELETED;
  readonly id: EventId;
  readonly calendarId: CalendarId;
  readonly lastModified: Timestamp;
  readonly deletedAt: Timestamp;
  readonly reason: DeletionReason;
  readonly originalSubject?: string | undefined;
  readonly originalStart?: EventDateTime | undefined;
  readonly originalEnd?: EventDateTime | undefined;
  readonly deletedBy?: UserId | undefined;

  constructor(config: Omit<DeletedEvent, 'type'>) {
    // Validation
    if (config.reason.trim().length === 0) {
      throw new Error('Deletion reason cannot be empty');
    }
    
    if (config.deletedAt.isBefore(config.lastModified)) {
      throw new Error('Deletion time cannot be before last modification time');
    }
    
    this.id = config.id;
    this.calendarId = config.calendarId;
    this.lastModified = config.lastModified;
    this.deletedAt = config.deletedAt;
    this.reason = config.reason as DeletionReason;
    this.originalSubject = config.originalSubject?.trim();
    this.originalStart = config.originalStart;
    this.originalEnd = config.originalEnd;
    this.deletedBy = config.deletedBy;
    
    // Freeze for immutability
    Object.freeze(this);
  }
}

/**
 * Factory function to create EventDateTime instances
 */
export const createEventDateTime = (
  timestamp: Timestamp,
  timeZone: string
): EventDateTime => {
  return new EventDateTimeImpl(timestamp, timeZone);
};

/**
 * Factory function to create Attendee instances
 */
export const createAttendee = (
  userId: UserId,
  email: string,
  displayName: string,
  status: AttendeeStatus,
  isOptional?: boolean,
  responseTime?: Timestamp
): Attendee => {
  return new AttendeeImpl(userId, email, displayName, status, isOptional, responseTime);
};

/**
 * Factory function to create NormalEvent instances
 */
export const createNormalEvent = (
  config: Omit<NormalEvent, 'type'>
): NormalEvent => {
  return new NormalEventImpl(config);
};

/**
 * Factory function to create DeletedEvent instances
 */
export const createDeletedEvent = (
  config: Omit<DeletedEvent, 'type'>
): DeletedEvent => {
  return new DeletedEventImpl(config);
};

/**
 * Type guard to check if an event is a normal event
 */
export const isNormalEvent = (event: Event): event is NormalEvent => {
  return event.type === EventType.NORMAL;
};

/**
 * Type guard to check if an event is a deleted event
 */
export const isDeletedEvent = (event: Event): event is DeletedEvent => {
  return event.type === EventType.DELETED;
};

/**
 * Maps over an event, applying the transformation function
 */
export const mapEvent = <T>(
  event: Event,
  transform: (event: Event) => T
): T => {
  return transform(event);
};

/**
 * Filters out deleted events, returning only active events
 */
export const filterActiveEvents = (events: readonly Event[]): NormalEvent[] => {
  return events.filter(isNormalEvent);
};

/**
 * Compares two events for equality (by ID and type)
 */
export const eventEquals = (event1: Event, event2: Event): boolean => {
  return event1.id.equals(event2.id) && event1.type === event2.type;
};

/**
 * Serializes an event to a JSON-compatible object
 */
export const serializeEvent = (event: Event): any => {
  const base = {
    id: event.id.value,
    calendarId: event.calendarId.value,
    lastModified: event.lastModified.value,
    type: event.type
  };
  
  if (isNormalEvent(event)) {
    return {
      ...base,
      subject: event.subject,
      start: {
        timestamp: event.start.timestamp.value,
        timeZone: event.start.timeZone
      },
      end: {
        timestamp: event.end.timestamp.value,
        timeZone: event.end.timeZone
      },
      attendees: event.attendees.map(attendee => ({
        userId: attendee.userId.value,
        email: attendee.email,
        displayName: attendee.displayName,
        status: attendee.status,
        isOptional: attendee.isOptional,
        responseTime: attendee.responseTime?.value
      })),
      status: event.status,
      isAllDay: event.isAllDay,
      location: event.location,
      description: event.description,
      organizer: event.organizer?.value,
      recurrenceRule: event.recurrenceRule,
      categories: event.categories,
      sensitivity: event.sensitivity
    };
  } else {
    return {
      ...base,
      deletedAt: event.deletedAt.value,
      reason: event.reason,
      originalSubject: event.originalSubject,
      originalStart: event.originalStart ? {
        timestamp: event.originalStart.timestamp.value,
        timeZone: event.originalStart.timeZone
      } : undefined,
      originalEnd: event.originalEnd ? {
        timestamp: event.originalEnd.timestamp.value,
        timeZone: event.originalEnd.timeZone
      } : undefined,
      deletedBy: event.deletedBy?.value
    };
  }
};

/**
 * Deserializes a JSON object back to an Event
 */
export const deserializeEvent = (data: any): Event => {
  const { createEventId, createCalendarId, createUserId, createTimestamp } = require('./types');
  
  const id = createEventId(data.id);
  const calendarId = createCalendarId(data.calendarId);
  const lastModified = createTimestamp(data.lastModified);
  
  if (data.type === EventType.NORMAL) {
    const start = createEventDateTime(
      createTimestamp(data.start.timestamp),
      data.start.timeZone
    );
    const end = createEventDateTime(
      createTimestamp(data.end.timestamp),
      data.end.timeZone
    );
    
    const attendees = data.attendees.map((attendeeData: any) => 
      createAttendee(
        createUserId(attendeeData.userId),
        attendeeData.email,
        attendeeData.displayName,
        attendeeData.status,
        attendeeData.isOptional,
        attendeeData.responseTime ? createTimestamp(attendeeData.responseTime) : undefined
      )
    );
    
    return createNormalEvent({
      id,
      calendarId,
      lastModified,
      subject: data.subject,
      start,
      end,
      attendees,
      status: data.status,
      isAllDay: data.isAllDay,
      location: data.location,
      description: data.description,
      organizer: data.organizer ? createUserId(data.organizer) : undefined,
      recurrenceRule: data.recurrenceRule,
      categories: data.categories,
      sensitivity: data.sensitivity
    });
  } else {
    const deletedAt = createTimestamp(data.deletedAt);
    const originalStart = data.originalStart ? createEventDateTime(
      createTimestamp(data.originalStart.timestamp),
      data.originalStart.timeZone
    ) : undefined;
    const originalEnd = data.originalEnd ? createEventDateTime(
      createTimestamp(data.originalEnd.timestamp),
      data.originalEnd.timeZone
    ) : undefined;
    
    return createDeletedEvent({
      id,
      calendarId,
      lastModified,
      deletedAt,
      reason: data.reason,
      originalSubject: data.originalSubject,
      originalStart,
      originalEnd,
      deletedBy: data.deletedBy ? createUserId(data.deletedBy) : undefined
    });
  }
};

/**
 * Utility function for exhaustive pattern matching on events
 */
export const matchEvent = <T>(
  event: Event,
  handlers: {
    normal: (event: NormalEvent) => T;
    deleted: (event: DeletedEvent) => T;
  }
): T => {
  switch (event.type) {
    case EventType.NORMAL:
      return handlers.normal(event);
    case EventType.DELETED:
      return handlers.deleted(event);
    default:
      // TypeScript ensures this is unreachable
      const _exhaustive: never = event;
      throw new Error(`Unhandled event type: ${_exhaustive}`);
  }
};

/**
 * Utility function to get a human-readable event summary
 */
export const getEventSummary = (event: Event): string => {
  return matchEvent(event, {
    normal: (e) => `${e.subject} (${e.start.toISOString()} - ${e.end.toISOString()})`,
    deleted: (e) => `Deleted: ${e.originalSubject || 'Unknown'} (${e.reason})`
  });
};

/**
 * Utility function to check if an event is happening within a time range
 */
export const isEventInRange = (
  event: Event,
  startRange: Timestamp,
  endRange: Timestamp
): boolean => {
  return matchEvent(event, {
    normal: (e) => {
      return e.start.timestamp.isAfter(startRange) || e.start.timestamp.equals(startRange) &&
             e.end.timestamp.isBefore(endRange) || e.end.timestamp.equals(endRange);
    },
    deleted: (e) => {
      if (e.originalStart && e.originalEnd) {
        return e.originalStart.timestamp.isAfter(startRange) || e.originalStart.timestamp.equals(startRange) &&
               e.originalEnd.timestamp.isBefore(endRange) || e.originalEnd.timestamp.equals(endRange);
      }
      return false;
    }
  });
};

/**
 * Utility function to get all unique attendees from a list of events
 */
export const getUniqueAttendees = (events: readonly Event[]): Attendee[] => {
  const attendeeMap = new Map<string, Attendee>();
  
  events.forEach(event => {
    if (isNormalEvent(event)) {
      event.attendees.forEach(attendee => {
        attendeeMap.set(attendee.userId.value, attendee);
      });
    }
  });
  
  return Array.from(attendeeMap.values());
};