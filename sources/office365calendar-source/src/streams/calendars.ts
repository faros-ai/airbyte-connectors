import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import { Dictionary } from 'ts-essentials';
import { VError } from 'verror';

import { Office365CalendarConfig, Calendar, LogUtils, ErrorUtils } from '../models';
import { Office365Calendar } from '../office365calendar';

/**
 * State interface for the calendars stream.
 * 
 * @interface CalendarsState
 */
interface CalendarsState {
  /** Optional sync token for incremental updates */
  lastSyncToken?: string;
}

/**
 * Mapped calendar interface for Google Calendar compatibility.
 * 
 * This interface defines the structure of calendar objects as they should be
 * output by the stream, mapping Office 365 calendar fields to Google Calendar schema.
 * 
 * @interface MappedCalendar
 */
interface MappedCalendar {
  /** Unique identifier for the calendar */
  readonly id: string;
  
  /** Summary/name of the calendar (Google Calendar field) */
  readonly summary: string;
  
  /** Description of the calendar (optional) */
  readonly description?: string;
  
  /** Owner information (optional) */
  readonly owner?: {
    /** Display name of the owner */
    readonly name: string;
    /** Email address of the owner */
    readonly email: string;
  };
  
  /** Access role of the current user */
  readonly accessRole: string;
  
  /** Whether this is the primary calendar (optional) */
  readonly primary?: boolean;
  
  /** Whether the user can edit this calendar (optional) */
  readonly canEdit?: boolean;
  
  /** Whether the user can share this calendar (optional) */
  readonly canShare?: boolean;
  
  /** Whether the user can view private items (optional) */
  readonly canViewPrivateItems?: boolean;
}

/**
 * Calendars stream implementation for Office 365 Calendar connector.
 * 
 * This stream fetches calendar data from Office 365 and maps it to the expected
 * output format. It supports both single-user and domain-wide delegation scenarios.
 * 
 * @class Calendars
 * @extends {AirbyteStreamBase}
 */
export class Calendars extends AirbyteStreamBase {
  private readonly structuredLogger: ReturnType<typeof LogUtils.createStructuredLogger>;
  
  /**
   * Creates an instance of Calendars stream.
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
   * @returns {string} The stream name 'calendars'
   */
  get name(): string {
    return 'calendars';
  }

  /**
   * Gets the JSON schema for calendar objects.
   * 
   * @returns {Dictionary<any, string>} The JSON schema definition
   */
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/calendars.json');
  }

  /**
   * Gets the primary key field for calendar objects.
   * 
   * @returns {StreamKey} The primary key field name 'id'
   */
  get primaryKey(): StreamKey {
    return 'id';
  }

  /**
   * Gets the supported synchronization modes for this stream.
   * 
   * @returns {SyncMode[]} Array containing only FULL_REFRESH mode
   */
  get supportedSyncModes(): SyncMode[] {
    return [SyncMode.FULL_REFRESH];
  }

  /**
   * Reads calendar records from Office 365.
   * 
   * This method fetches calendars from Office 365 and yields them as MappedCalendar objects.
   * It supports both single-user and domain-wide delegation scenarios.
   * 
   * @param {SyncMode} syncMode - The synchronization mode (only FULL_REFRESH supported)
   * @param {string[]} cursorField - Optional cursor field (not used for calendars)
   * @param {Dictionary<any, string>} streamSlice - Optional stream slice (not used for calendars)
   * @param {CalendarsState} streamState - Optional stream state (not used for calendars)
   * @returns {AsyncGenerator<MappedCalendar>} Async generator yielding MappedCalendar objects
   * 
   * @example
   * ```typescript
   * const stream = new Calendars(config, logger);
   * for await (const calendar of stream.readRecords(SyncMode.FULL_REFRESH)) {
   *   console.log('Calendar:', calendar.summary);
   * }
   * ```
   */
  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any, string>,
    streamState?: CalendarsState
  ): AsyncGenerator<MappedCalendar> {
    this.logger.info('Starting calendars sync');
    
    let totalCalendars = 0;

    try {
      const office365Calendar = await Office365Calendar.instance(this.config, this.logger);

      if (this.config.domain_wide_delegation) {
        // Domain-wide delegation: fetch calendars for all users
        for await (const calendar of this.fetchCalendarsForAllUsers(office365Calendar)) {
          totalCalendars++;
          yield calendar;
        }
      } else {
        // Single user: fetch calendars for current user
        for await (const calendar of this.fetchCurrentUserCalendars(office365Calendar)) {
          totalCalendars++;
          yield calendar;
        }
      }

    } catch (error) {
      if (error instanceof VError && ErrorUtils.getMessage(error).includes('Authentication')) {
        // Re-throw authentication errors
        throw error;
      }
      
      this.structuredLogger.warn('Failed to fetch calendars', { error: ErrorUtils.getMessage(error) });
      return;
    }

    this.logger.info(`Completed calendars sync`, `${totalCalendars} calendars`);
  }

  /**
   * Fetches calendars for the current user.
   * 
   * @private
   * @param {Office365Calendar} office365Calendar - The Office 365 Calendar API client
   * @returns {AsyncGenerator<MappedCalendar>} Async generator yielding MappedCalendar objects
   * @throws {Error} When calendar fetching fails
   */
  private async *fetchCurrentUserCalendars(office365Calendar: Office365Calendar): AsyncGenerator<MappedCalendar> {
    try {
      let calendarCount = 0;

      for await (const calendar of office365Calendar.getCalendars()) {
        const mappedCalendar = this.mapCalendarToGoogleSchema(calendar);
        this.logger.debug(`Fetched calendar`, `${calendar.id}: ${calendar.name}`);
        
        calendarCount++;
        yield mappedCalendar;
      }

      if (calendarCount === 0) {
        this.logger.warn('No calendars found for current user');
      }

    } catch (error) {
      this.structuredLogger.warn('Error fetching calendar', { error: ErrorUtils.getMessage(error) });
      throw error;
    }
  }

  /**
   * Fetches calendars for all users in domain-wide delegation scenarios.
   * 
   * @private
   * @param {Office365Calendar} office365Calendar - The Office 365 Calendar API client
   * @returns {AsyncGenerator<MappedCalendar>} Async generator yielding MappedCalendar objects
   * @throws {Error} When calendar fetching fails
   */
  private async *fetchCalendarsForAllUsers(office365Calendar: Office365Calendar): AsyncGenerator<MappedCalendar> {
    try {
      // Get all users in the organization
      for await (const user of office365Calendar.getUsers()) {
        this.logger.debug(`Fetching calendars for user: ${user.mail || user.id}`);
        
        try {
          // Get calendars for this specific user
          for await (const calendar of office365Calendar.getCalendars()) {
            const mappedCalendar = this.mapCalendarToGoogleSchema(calendar);
            this.logger.debug(`Fetched calendar for user ${user.mail}`, `${calendar.id}: ${calendar.name}`);
            yield mappedCalendar;
          }
        } catch (userError) {
          // Log warning but continue with other users
          this.structuredLogger.warn('Failed to fetch calendars for user', { 
            user: user.mail || user.id, 
            error: ErrorUtils.getMessage(userError) 
          });
          continue;
        }
      }
    } catch (error) {
      this.structuredLogger.warn('Error in domain-wide delegation', { error: ErrorUtils.getMessage(error) });
      throw error;
    }
  }

  /**
   * Maps an Office 365 calendar object to Google Calendar schema format.
   * 
   * This method transforms Office 365 calendar data into the expected output format
   * for compatibility with Google Calendar schema.
   * 
   * @private
   * @param {Calendar} office365Calendar - The Office 365 calendar object
   * @returns {MappedCalendar} The mapped calendar object
   * 
   * @example
   * ```typescript
   * const mappedCalendar = this.mapCalendarToGoogleSchema(office365Calendar);
   * console.log(mappedCalendar.summary); // Office 365 'name' becomes 'summary'
   * ```
   */
  private mapCalendarToGoogleSchema(office365Calendar: Calendar): MappedCalendar {
    // Map Office 365 calendar fields to Google Calendar schema
    const accessRole = this.mapPermissionsToAccessRole(
      office365Calendar.canEdit,
      office365Calendar.canShare,
      office365Calendar.canViewPrivateItems
    );

    // Determine if this is the primary calendar
    const isPrimary = office365Calendar.name === 'Calendar' || 
                     accessRole === 'owner';

    return {
      id: office365Calendar.id,
      summary: office365Calendar.name, // Office 365 'name' → Google 'summary'
      description: office365Calendar.description || undefined,
      owner: office365Calendar.owner ? {
        name: office365Calendar.owner.name,
        email: office365Calendar.owner.email
      } : undefined,
      accessRole,
      primary: isPrimary,
      canEdit: office365Calendar.canEdit,
      canShare: office365Calendar.canShare,
      canViewPrivateItems: office365Calendar.canViewPrivateItems
    };
  }

  /**
   * Maps Office 365 permission flags to Google Calendar access roles.
   * 
   * This method converts Office 365 permission flags into Google Calendar-compatible
   * access role strings.
   * 
   * @private
   * @param {boolean} canEdit - Whether the user can edit the calendar
   * @param {boolean} canShare - Whether the user can share the calendar
   * @param {boolean} canViewPrivateItems - Whether the user can view private items
   * @returns {string} The Google Calendar access role ('owner', 'writer', or 'reader')
   * 
   * @example
   * ```typescript
   * const role = this.mapPermissionsToAccessRole(true, true, true); // Returns 'owner'
   * const role2 = this.mapPermissionsToAccessRole(true, false, false); // Returns 'writer'
   * const role3 = this.mapPermissionsToAccessRole(false, false, false); // Returns 'reader'
   * ```
   */
  private mapPermissionsToAccessRole(canEdit: boolean, canShare: boolean, canViewPrivateItems: boolean): string {
    // Map Office 365 permissions to Google Calendar access roles
    if (canEdit && canShare && canViewPrivateItems) {
      return 'owner';
    } else if (canEdit && !canShare) {
      return 'writer';
    } else {
      return 'reader';
    }
  }
}