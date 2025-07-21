/**
 * Type definitions for Office 365 Calendar data structures.
 * 
 * These interfaces define the structure of Office 365 Calendar data as it
 * appears in Airbyte records, matching the Google Calendar schema format
 * that the Office 365 Calendar source connector outputs.
 */

/**
 * Office 365 Calendar event data structure.
 * 
 * This matches the Google Calendar event schema that the Office 365 source
 * connector outputs, providing compatibility with existing Google Calendar
 * converters while maintaining Office 365-specific features.
 */
export interface Office365Event {
  /** Unique identifier for the event */
  id: string;
  
  /** Resource type identifier */
  kind: string;
  
  /** ETag for change tracking */
  etag?: string;
  
  /** Event status (confirmed, cancelled, etc.) */
  status: string;
  
  /** HTML link to the event in Office 365 */
  htmlLink?: string;
  
  /** Creation timestamp */
  created: string;
  
  /** Last update timestamp */
  updated: string;
  
  /** Event title/subject */
  summary: string;
  
  /** Event description/body */
  description?: string;
  
  /** Event location */
  location?: string;
  
  /** Event creator */
  creator?: Office365User;
  
  /** Event organizer */
  organizer?: Office365User;
  
  /** Event start time */
  start: Office365DateTime;
  
  /** Event end time */
  end: Office365DateTime;
  
  /** Event attendees */
  attendees?: Office365Attendee[];
  
  /** Transparency setting (opaque/transparent) */
  transparency: string;
  
  /** Visibility setting */
  visibility?: string;
  
  /** Importance level */
  importance?: string;
  
  /** Calendar ID containing this event */
  calendarId?: string;
  
  /** Next sync token for incremental sync */
  nextSyncToken?: string;
  
  /** Marker for deleted events */
  '@removed'?: {
    reason: string;
  };
}

/**
 * Office 365 Calendar user/attendee information.
 */
export interface Office365User {
  /** User ID */
  id?: string;
  
  /** User email address */
  email: string;
  
  /** User display name */
  displayName: string;
  
  /** Whether this is the current user */
  self?: boolean;
}

/**
 * Office 365 Calendar attendee information.
 */
export interface Office365Attendee extends Office365User {
  /** Attendee response status */
  responseStatus: string;
  
  /** Whether attendance is optional */
  optional: boolean;
}

/**
 * Office 365 Calendar date/time structure.
 */
export interface Office365DateTime {
  /** Date for all-day events */
  date?: string;
  
  /** Date and time for timed events */
  dateTime?: string;
  
  /** Time zone */
  timeZone?: string;
}

/**
 * Office 365 Calendar information.
 */
export interface Office365Calendar {
  /** Unique identifier for the calendar */
  id: string;
  
  /** Resource type identifier */
  kind: string;
  
  /** ETag for change tracking */
  etag?: string;
  
  /** Calendar title/name */
  summary: string;
  
  /** Calendar description */
  description?: string;
  
  /** Default time zone */
  timeZone?: string;
  
  /** Geographic location */
  location?: string;
  
  /** Whether this is the primary calendar */
  primary?: boolean;
  
  /** Access role for current user */
  accessRole?: string;
}