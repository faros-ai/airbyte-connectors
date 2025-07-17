import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import { Dictionary } from 'ts-essentials';
import { VError } from 'verror';

import { Office365CalendarConfig, Event, DeletedEvent, LogUtils, ErrorUtils } from '../models';
import { Office365Calendar } from '../office365calendar';

/**
 * Stream slice definition for the events stream.
 * 
 * @typedef {Object} StreamSlice
 * @property {string} calendarId - The ID of the calendar to sync events from
 * @property {string} userId - Optional user ID for domain-wide delegation
 */
type StreamSlice = { calendarId: string; userId?: string };

/**
 * State interface for the events stream.
 * 
 * Maps calendar IDs to their sync state for incremental synchronization.
 * 
 * @interface EventsState
 */
interface EventsState {
  /** Map of calendar IDs to their sync state */
  [calendarId: string]: { 
    /** Optional sync token for incremental updates */
    lastSyncToken?: string 
  };
}

/**
 * Mapped event interface for Google Calendar compatibility.
 * 
 * This interface defines the structure of event objects as they should be
 * output by the stream, mapping Office 365 event fields to Google Calendar schema.
 * 
 * @interface MappedEvent
 */
interface MappedEvent {
  /** Kind identifier for the event (always 'calendar#event') */
  readonly kind: string;
  
  /** ETag for change tracking (optional) */
  readonly etag?: string;
  
  /** Unique identifier for the event */
  readonly id: string;
  
  /** Status of the event (confirmed, cancelled, etc.) */
  readonly status: string;
  
  /** HTML link to the event (optional) */
  readonly htmlLink?: string;
  
  /** Creation timestamp */
  readonly created: string;
  
  /** Last update timestamp */
  readonly updated: string;
  
  /** Summary/title of the event */
  readonly summary: string;
  
  /** Description of the event (optional) */
  readonly description?: string;
  
  /** Location of the event (optional) */
  readonly location?: string;
  
  /** Color ID for the event (optional) */
  readonly colorId?: string;
  
  /** Creator of the event (optional) */
  readonly creator?: {
    /** Creator ID (optional) */
    readonly id?: string;
    /** Creator email address */
    readonly email: string;
    /** Creator display name */
    readonly displayName: string;
    /** Whether the creator is the current user */
    readonly self: boolean;
  };
  
  /** Organizer of the event (optional) */
  readonly organizer?: {
    /** Organizer ID (optional) */
    readonly id?: string;
    /** Organizer email address */
    readonly email: string;
    /** Organizer display name */
    readonly displayName: string;
    /** Whether the organizer is the current user */
    readonly self: boolean;
  };
  
  /** Start date and time of the event */
  readonly start: {
    /** Date for all-day events (optional) */
    readonly date?: string;
    /** Date and time for timed events (optional) */
    readonly dateTime?: string;
    /** Time zone (optional) */
    readonly timeZone?: string;
  };
  
  /** End date and time of the event */
  readonly end: {
    /** Date for all-day events (optional) */
    readonly date?: string;
    /** Date and time for timed events (optional) */
    readonly dateTime?: string;
    /** Time zone (optional) */
    readonly timeZone?: string;
  };
  
  /** List of attendees (optional) */
  readonly attendees?: readonly {
    /** Attendee ID (optional) */
    readonly id?: string;
    /** Attendee email address */
    readonly email: string;
    /** Attendee display name */
    readonly displayName: string;
    /** Response status of the attendee */
    readonly responseStatus: string;
    /** Whether the attendee is optional */
    readonly optional: boolean;
  }[];
  
  /** Transparency setting (opaque/transparent) */
  readonly transparency: string;
  
  /** Visibility setting (optional) */
  readonly visibility?: string;
  
  /** Importance level (optional) */
  readonly importance?: string;
  
  /** Next sync token for incremental sync (optional) */
  readonly nextSyncToken?: string;
  
  /** Calendar ID for state management (optional) */
  readonly calendarId?: string;
  
  /** Marker for deleted events (optional) */
  readonly '@removed'?: { readonly reason: string };
}

/**
 * Events stream implementation for Office 365 Calendar connector.
 * 
 * This stream fetches calendar events from Office 365 and maps them to the expected
 * output format. It supports both full refresh and incremental synchronization.
 * 
 * @class Events
 * @extends {AirbyteStreamBase}
 */
export class Events extends AirbyteStreamBase {
  private readonly structuredLogger: ReturnType<typeof LogUtils.createStructuredLogger>;
  
  /**
   * Creates an instance of Events stream.
   * 
   * @param {Office365CalendarConfig} config - The Office 365 configuration
   * @param {AirbyteLogger} logger - Logger instance for debugging
   */
  constructor(
    readonly config: Office365CalendarConfig,
    logger: AirbyteLogger
  ) {
    super(logger);
    this.structuredLogger = LogUtils.createStructuredLogger(logger);
  }

  /**
   * Gets the name of this stream.
   * 
   * @returns {string} The stream name 'events'
   */
  get name(): string {
    return 'events';
  }

  /**
   * Gets the JSON schema for event objects.
   * 
   * @returns {Dictionary<any, string>} The JSON schema definition
   */
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/events.json');
  }

  /**
   * Gets the primary key field for event objects.
   * 
   * @returns {StreamKey} The primary key field name 'id'
   */
  get primaryKey(): StreamKey {
    return 'id';
  }

  /**
   * Gets the supported synchronization modes for this stream.
   * 
   * @returns {SyncMode[]} Array containing FULL_REFRESH and INCREMENTAL modes
   */
  get supportedSyncModes(): SyncMode[] {
    return [SyncMode.FULL_REFRESH, SyncMode.INCREMENTAL];
  }

  /**
   * Gets the cursor field for incremental synchronization.
   * 
   * @returns {string | string[]} The cursor field name 'nextSyncToken'
   */
  get cursorField(): string | string[] {
    return 'nextSyncToken';
  }

  /**
   * Generates stream slices for parallel processing of calendars.
   * 
   * Each slice represents a calendar to sync events from. This allows for
   * parallel processing of multiple calendars and proper state management.
   * 
   * @returns {AsyncGenerator<StreamSlice>} Async generator yielding StreamSlice objects
   * 
   * @example
   * ```typescript
   * for await (const slice of stream.streamSlices()) {
   *   console.log('Processing calendar:', slice.calendarId);
   * }
   * ```
   */
  async *streamSlices(): AsyncGenerator<StreamSlice> {
    try {
      if (this.config.calendar_ids && this.config.calendar_ids.length > 0) {
        // Use specific calendar IDs from configuration
        for (const calendarId of this.config.calendar_ids) {
          yield { calendarId };
        }
      } else {
        // Fetch all available calendars and create slices
        const office365Calendar = await Office365Calendar.instance(this.config, this.logger);
        
        try {
          if (this.config.domain_wide_delegation) {
            // Domain-wide delegation: get calendars from all users
            for await (const user of office365Calendar.getUsers()) {
              try {
                for await (const calendar of office365Calendar.getCalendars()) {
                  yield { calendarId: calendar.id, userId: user.id };
                }
              } catch (userError) {
                this.structuredLogger.warn('Failed to fetch calendars for user', { 
                  user: user.mail || user.id, 
                  error: ErrorUtils.getMessage(userError) 
                });
                continue;
              }
            }
          } else {
            // Single user: get calendars for current user
            for await (const calendar of office365Calendar.getCalendars()) {
              yield { calendarId: calendar.id };
            }
          }
        } catch (error) {
          this.structuredLogger.warn('Failed to fetch calendars for stream slicing', { error: ErrorUtils.getMessage(error) });
          return;
        }
      }
    } catch (error) {
      this.structuredLogger.warn('Failed to create stream slices', { error: ErrorUtils.getMessage(error) });
      return;
    }
  }

  /**
   * Reads event records from Office 365 for a specific calendar.
   * 
   * This method fetches events from the specified calendar and yields them as MappedEvent objects.
   * It supports both full refresh and incremental synchronization modes.
   * 
   * @param {SyncMode} syncMode - The synchronization mode (FULL_REFRESH or INCREMENTAL)
   * @param {string[]} cursorField - Optional cursor field for incremental sync
   * @param {StreamSlice} streamSlice - Stream slice containing calendar information
   * @param {EventsState} streamState - Stream state for incremental sync
   * @returns {AsyncGenerator<MappedEvent>} Async generator yielding MappedEvent objects
   * 
   * @example
   * ```typescript
   * const slice = { calendarId: 'calendar123' };
   * for await (const event of stream.readRecords(SyncMode.FULL_REFRESH, undefined, slice)) {
   *   console.log('Event:', event.summary);
   * }
   * ```
   */
  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: EventsState
  ): AsyncGenerator<MappedEvent> {
    if (!streamSlice) {
      this.logger.error('Stream slice is required for events stream');
      return;
    }

    const { calendarId, userId } = streamSlice;
    const userContext = userId ? ` for user ${userId}` : '';
    const syncModeStr = syncMode === SyncMode.INCREMENTAL ? 'incremental' : 'full refresh';
    this.logger.info(`Starting ${syncModeStr} events sync`, `calendar: ${calendarId}${userContext}`);
    
    // Get current user email for self determination in event mapping
    let currentUserEmail: string | undefined;
    try {
      const office365Calendar = await Office365Calendar.instance(this.config, this.logger);
      currentUserEmail = await this.getCurrentUserEmail(office365Calendar, userId);
    } catch (error) {
      this.structuredLogger.warn('Could not determine current user email for self identification', { error: ErrorUtils.getMessage(error) });
    }
    
    let totalEvents = 0;

    try {
      const office365Calendar = await Office365Calendar.instance(this.config, this.logger);

      // Determine sync strategy
      const existingToken = syncMode === SyncMode.INCREMENTAL 
        ? streamState?.[calendarId]?.lastSyncToken 
        : undefined;

      if (syncMode === SyncMode.INCREMENTAL && existingToken) {
        // Use incremental sync with delta queries
        this.logger.debug(`Using incremental sync for calendar ${calendarId}`);
        for await (const event of this.readIncrementalRecords(office365Calendar, calendarId, existingToken, userId, currentUserEmail)) {
          totalEvents++;
          yield event;
        }
      } else {
        // Use full refresh
        this.logger.debug(`Using full refresh for calendar ${calendarId}`);
        for await (const event of this.readFullRefreshRecords(office365Calendar, calendarId, userId, currentUserEmail)) {
          totalEvents++;
          yield event;
        }
      }

    } catch (error) {
      if (error instanceof VError && ErrorUtils.getMessage(error).includes('Authentication')) {
        // Re-throw authentication errors
        throw error;
      }
      
      this.structuredLogger.warn('Failed to fetch events for calendar', { 
        calendarId, 
        error: ErrorUtils.getMessage(error) 
      });
      return;
    }

    this.logger.info(`Completed ${syncModeStr} events sync`, `calendar: ${calendarId}, ${totalEvents} events`);
  }

  /**
   * Maps an Office 365 event object to Google Calendar schema format.
   * 
   * This method transforms Office 365 event data into the expected output format
   * for compatibility with Google Calendar schema.
   * 
   * @private
   * @param {Event} office365Event - The Office 365 event object
   * @param {string} currentUserEmail - Optional current user email for self identification
   * @returns {MappedEvent} The mapped event object
   * 
   * @example
   * ```typescript
   * const mappedEvent = this.mapEventToGoogleSchema(office365Event, 'user@example.com');
   * console.log(mappedEvent.summary); // Office 365 'subject' becomes 'summary'
   * ```
   */
  private mapEventToGoogleSchema(office365Event: Event, currentUserEmail?: string): MappedEvent {
    // Map Office 365 event fields to Google Calendar schema
    
    // Handle start/end times (support both all-day and timed events)
    const start = office365Event.start ? {
      date: office365Event.start.date,
      dateTime: office365Event.start.dateTime,
      timeZone: office365Event.start.timeZone
    } : { dateTime: undefined, timeZone: undefined };

    const end = office365Event.end ? {
      date: office365Event.end.date,
      dateTime: office365Event.end.dateTime,
      timeZone: office365Event.end.timeZone
    } : { dateTime: undefined, timeZone: undefined };

    // Map organizer
    const organizer = office365Event.organizer ? {
      id: office365Event.organizer.emailAddress.address, // Use email as ID
      email: office365Event.organizer.emailAddress.address,
      displayName: office365Event.organizer.emailAddress.name,
      self: currentUserEmail ? office365Event.organizer.emailAddress.address === currentUserEmail : false
    } : undefined;

    // Map attendees
    const attendees = office365Event.attendees?.map(attendee => ({
      id: attendee.emailAddress.address, // Use email as ID
      email: attendee.emailAddress.address,
      displayName: attendee.emailAddress.name,
      responseStatus: this.mapAttendeeResponseStatus(attendee.status.response),
      optional: attendee.type === 'optional'
    }));

    // Map transparency (free/busy status)
    const transparency = this.mapShowAsToTransparency(office365Event.showAs);

    // Map event status
    const status = office365Event.isCancelled ? 'cancelled' : 'confirmed';

    return {
      kind: 'calendar#event',
      etag: `"${office365Event.lastModifiedDateTime}"`, // Use lastModified as etag
      id: office365Event.id,
      status,
      htmlLink: `https://outlook.office365.com/calendar/item/${office365Event.id}`, // Office 365 web link
      created: office365Event.createdDateTime,
      updated: office365Event.lastModifiedDateTime,
      summary: office365Event.subject || '',
      description: office365Event.body?.content || undefined,
      location: office365Event.location ? (
        typeof office365Event.location === 'string' 
          ? office365Event.location 
          : office365Event.location.displayName
      ) : undefined,
      colorId: undefined, // Office 365 doesn't have color IDs like Google
      creator: organizer ? {
        ...organizer,
        self: currentUserEmail ? organizer.email === currentUserEmail : false
      } : undefined, // In Office 365, creator is typically the organizer
      organizer,
      start,
      end,
      attendees,
      transparency,
      visibility: this.mapSensitivityToVisibility(office365Event.sensitivity),
      importance: office365Event.importance
    };
  }

  /**
   * Maps Office 365 'showAs' status to Google Calendar transparency.
   * 
   * @private
   * @param {string} showAs - The Office 365 showAs status
   * @returns {string} The Google Calendar transparency value ('transparent' or 'opaque')
   * 
   * @example
   * ```typescript
   * const transparency = this.mapShowAsToTransparency('free'); // Returns 'transparent'
   * const transparency2 = this.mapShowAsToTransparency('busy'); // Returns 'opaque'
   * ```
   */
  private mapShowAsToTransparency(showAs?: string): string {
    // Map Office 365 showAs to Google Calendar transparency
    switch (showAs) {
      case 'free':
      case 'tentative':
        return 'transparent';
      case 'busy':
      case 'oof': // Out of office
      default:
        return 'opaque';
    }
  }

  /**
   * Maps Office 365 attendee response status to Google Calendar format.
   * 
   * @private
   * @param {string} response - The Office 365 response status
   * @returns {string} The Google Calendar response status
   * 
   * @example
   * ```typescript
   * const status = this.mapAttendeeResponseStatus('accepted'); // Returns 'accepted'
   * const status2 = this.mapAttendeeResponseStatus('notResponded'); // Returns 'needsAction'
   * ```
   */
  private mapAttendeeResponseStatus(response?: string): string {
    // Map Office 365 response status to Google Calendar format
    switch (response) {
      case 'accepted':
        return 'accepted';
      case 'declined':
        return 'declined';
      case 'tentative':
        return 'tentative';
      case 'notResponded':
      default:
        return 'needsAction';
    }
  }

  /**
   * Maps Office 365 sensitivity to Google Calendar visibility.
   * 
   * @private
   * @param {string} sensitivity - The Office 365 sensitivity level
   * @returns {string} The Google Calendar visibility value
   * 
   * @example
   * ```typescript
   * const visibility = this.mapSensitivityToVisibility('private'); // Returns 'private'
   * const visibility2 = this.mapSensitivityToVisibility('normal'); // Returns 'default'
   * ```
   */
  private mapSensitivityToVisibility(sensitivity?: string): string {
    // Map Office 365 sensitivity to Google Calendar visibility
    switch (sensitivity) {
      case 'private':
        return 'private';
      case 'confidential':
        return 'confidential';
      case 'normal':
      default:
        return 'default';
    }
  }

  /**
   * Reads events using incremental synchronization with delta queries.
   * 
   * @private
   * @param {Office365Calendar} office365Calendar - The Office 365 Calendar API client
   * @param {string} calendarId - The ID of the calendar to sync
   * @param {string} deltaToken - The delta token from the previous sync
   * @param {string} userId - Optional user ID for domain-wide delegation
   * @param {string} currentUserEmail - Optional current user email for self identification
   * @returns {AsyncGenerator<MappedEvent>} Async generator yielding MappedEvent objects
   * @throws {Error} When incremental sync fails
   */
  private async *readIncrementalRecords(
    office365Calendar: Office365Calendar,
    calendarId: string,
    deltaToken: string,
    userId?: string,
    currentUserEmail?: string
  ): AsyncGenerator<MappedEvent> {
    try {
      for await (const deltaItem of office365Calendar.getEventsIncremental(calendarId, deltaToken)) {
        const { event, nextDeltaLink } = deltaItem;
        
        // Skip malformed events
        if (!event) {
          this.logger.warn('Skipping malformed event in delta response');
          continue;
        }

        // Handle deleted events
        if ((event as any)['@removed']) {
          const deletedEvent: DeletedEvent = {
            id: event.id,
            uid: event.uid,
            calendarUid: calendarId,
            deletedAt: new Date().toISOString(),
            source: 'office365'
          };
          yield this.mapDeletedEventToGoogleSchema(deletedEvent, nextDeltaLink, calendarId);
          continue;
        }

        // Map regular events
        const mappedEvent = this.mapEventToGoogleSchema(event, currentUserEmail);
        yield {
          ...mappedEvent,
          nextSyncToken: nextDeltaLink,
          calendarId
        };
      }
    } catch (error) {
      // Handle 410 "Gone" errors for expired delta tokens
      if (error instanceof VError && ErrorUtils.getMessage(error).includes('Delta token expired')) {
        this.logger.warn('Delta token expired for calendar', `${calendarId}, falling back to full refresh`);
        yield* this.readFullRefreshRecords(office365Calendar, calendarId, userId, currentUserEmail);
        return;
      }
      
      // Handle 410 status code from Microsoft Graph API
      if ((error as Error & { response?: { status?: number } }).response?.status === 410) {
        this.logger.warn('Delta token expired for calendar', `${calendarId}, falling back to full refresh`);
        yield* this.readFullRefreshRecords(office365Calendar, calendarId, userId, currentUserEmail);
        return;
      }
      
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Reads events using full refresh synchronization.
   * 
   * @private
   * @param {Office365Calendar} office365Calendar - The Office 365 Calendar API client
   * @param {string} calendarId - The ID of the calendar to sync
   * @param {string} userId - Optional user ID for domain-wide delegation
   * @param {string} currentUserEmail - Optional current user email for self identification
   * @returns {AsyncGenerator<MappedEvent>} Async generator yielding MappedEvent objects
   * @throws {Error} When full refresh fails
   */
  private async *readFullRefreshRecords(
    office365Calendar: Office365Calendar,
    calendarId: string,
    userId?: string,
    currentUserEmail?: string
  ): AsyncGenerator<MappedEvent> {
    for await (const event of office365Calendar.getEvents(calendarId, this.config, userId)) {
      const mappedEvent = this.mapEventToGoogleSchema(event, currentUserEmail);
      yield {
        ...mappedEvent,
        calendarId
      };
    }
  }

  /**
   * Maps a deleted event to Google Calendar schema format.
   * 
   * @private
   * @param {DeletedEvent} deletedEvent - The deleted event object
   * @param {string} nextDeltaLink - The next delta link for incremental sync
   * @param {string} calendarId - The ID of the calendar
   * @returns {MappedEvent} The mapped deleted event object
   * 
   * @example
   * ```typescript
   * const mappedDeleted = this.mapDeletedEventToGoogleSchema(deletedEvent, 'deltaLink', 'cal123');
   * console.log(mappedDeleted.status); // 'cancelled'
   * ```
   */
  private mapDeletedEventToGoogleSchema(
    deletedEvent: DeletedEvent,
    nextDeltaLink: string,
    calendarId: string
  ): MappedEvent {
    return {
      kind: 'calendar#event',
      id: deletedEvent.id || 'unknown',
      status: 'cancelled',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      summary: 'Deleted Event',
      start: { dateTime: undefined, timeZone: undefined },
      end: { dateTime: undefined, timeZone: undefined },
      transparency: 'opaque',
      '@removed': (deletedEvent as any)['@removed'],
      nextSyncToken: nextDeltaLink,
      calendarId
    };
  }

  /**
   * Updates the stream state with the latest sync token.
   * 
   * This method is called by the Airbyte framework to update the stream state
   * after processing each record during incremental synchronization.
   * 
   * @param {EventsState} currentStreamState - The current stream state
   * @param {MappedEvent} latestRecord - The latest processed record
   * @returns {EventsState} The updated stream state
   * 
   * @example
   * ```typescript
   * const newState = stream.getUpdatedState(currentState, latestEvent);
   * // newState will contain the updated sync token for the calendar
   * ```
   */
  getUpdatedState(
    currentStreamState: EventsState,
    latestRecord: MappedEvent
  ): EventsState {
    if (latestRecord?.calendarId && latestRecord?.nextSyncToken) {
      return {
        ...currentStreamState,
        [latestRecord.calendarId]: { lastSyncToken: latestRecord.nextSyncToken }
      };
    }
    return currentStreamState;
  }

  /**
   * Attempts to determine the current user's email address.
   * 
   * This method is used to identify whether the current user is the organizer
   * or attendee of events for proper mapping to Google Calendar schema.
   * 
   * @private
   * @param {Office365Calendar} office365Calendar - The Office 365 Calendar API client
   * @param {string} userId - Optional user ID for domain-wide delegation
   * @returns {Promise<string | undefined>} Promise resolving to the user email or undefined
   * 
   * @example
   * ```typescript
   * const userEmail = await this.getCurrentUserEmail(office365Calendar, userId);
   * if (userEmail) {
   *   console.log('Current user:', userEmail);
   * }
   * ```
   */
  private async getCurrentUserEmail(office365Calendar: Office365Calendar, userId?: string): Promise<string | undefined> {
    try {
      if (userId) {
        // In domain-wide delegation, we know the user ID
        return userId; // Assuming userId is actually the email in domain-wide delegation scenarios
      } else {
        // For single user scenarios, we could fetch the current user's profile
        // For now, return undefined as we don't have a direct way to get this from the Office365Calendar interface
        // This could be enhanced by adding a getCurrentUser method to Office365Calendar
        return undefined;
      }
    } catch (error) {
      this.structuredLogger.debug('Could not determine current user email', { error: ErrorUtils.getMessage(error) });
      return undefined;
    }
  }
}