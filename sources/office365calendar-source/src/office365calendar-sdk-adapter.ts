import { AirbyteLogger } from 'faros-airbyte-cdk';
import { VError } from 'verror';

import {
  Office365CalendarConfig,
  validateOffice365CalendarConfig,
  Calendar,
  Event,
  CalendarId,
  asCalendarId,
  asTenantId,
  asUserId,
  asDeltaToken,
  LogUtils,
  ErrorUtils
} from './models';
import { Office365CalendarSDK } from './office365calendar-sdk';

/**
 * Adapter class that provides backward compatibility with the original Office365Calendar interface
 * while using the new Microsoft Graph SDK internally.
 * 
 * This class acts as a facade over the new Office365CalendarSDK, providing the same API
 * that existing code expects while leveraging the improved implementation underneath.
 * 
 * @class Office365Calendar
 */
export class Office365Calendar {
  private static office365Calendar: Office365Calendar | null = null;
  private readonly sdk: Office365CalendarSDK;
  private readonly structuredLogger: ReturnType<typeof LogUtils.createStructuredLogger>;

  /**
   * Creates an instance of Office365Calendar.
   * 
   * @private
   * @param {Office365CalendarConfig} config - The Office 365 configuration
   * @param {AirbyteLogger} logger - Logger instance for debugging
   */
  private constructor(
    private readonly config: Office365CalendarConfig,
    private readonly logger: AirbyteLogger
  ) {
    // Validate configuration using existing validation
    validateOffice365CalendarConfig(config);
    
    // Create structured logger
    this.structuredLogger = LogUtils.createStructuredLogger(logger);
    
    // Create the new SDK instance internally
    this.sdk = new Office365CalendarSDK(config, logger);
    
    this.structuredLogger.info('Office 365 Calendar (SDK Adapter) initialized', {
      tenantId: config.tenant_id,
      clientId: config.client_id,
      domainWideDelegation: config.domain_wide_delegation,
      usingMicrosoftGraphSDK: true
    });
  }

  /**
   * Static factory method for creating Office365Calendar instances.
   * 
   * Implements the singleton pattern to ensure only one instance exists per process.
   * This maintains backward compatibility with existing code.
   * 
   * @static
   * @param {Office365CalendarConfig} config - The Office 365 configuration
   * @param {AirbyteLogger} logger - Logger instance for debugging
   * @returns {Promise<Office365Calendar>} Promise resolving to the Office365Calendar instance
   * 
   * @example
   * ```typescript
   * const config = {
   *   tenant_id: 'your-tenant-id',
   *   client_id: 'your-client-id',
   *   client_secret: 'your-client-secret'
   * };
   * const calendar = await Office365Calendar.instance(config, logger);
   * ```
   */
  static async instance(
    config: Office365CalendarConfig,
    logger: AirbyteLogger
  ): Promise<Office365Calendar> {
    if (!Office365Calendar.office365Calendar) {
      Office365Calendar.office365Calendar = new Office365Calendar(config, logger);
    }
    return Office365Calendar.office365Calendar;
  }

  /**
   * Clears the singleton instance for testing purposes.
   * 
   * This method is primarily used in test environments to ensure a clean state
   * between test runs.
   * 
   * @static
   * 
   * @example
   * ```typescript
   * // In test teardown
   * Office365Calendar.clearInstance();
   * ```
   */
  static clearInstance(): void {
    Office365Calendar.office365Calendar = null;
  }

  /**
   * Checks the connection to Office 365 using the configured credentials.
   * 
   * This method maintains the original interface while delegating to the new SDK.
   * 
   * @returns {Promise<boolean>} Promise resolving to true if connection is successful
   * @throws {VError} When connection check fails
   * 
   * @example
   * ```typescript
   * const isConnected = await calendar.checkConnection();
   * if (isConnected) {
   *   console.log('Successfully connected to Office 365');
   * }
   * ```
   */
  async checkConnection(): Promise<boolean> {
    try {
      return await this.sdk.checkConnection();
    } catch (error) {
      this.structuredLogger.error('Connection check failed', { error: ErrorUtils.getMessage(error) });
      throw new VError(error as Error, 'Failed to check Office 365 connection');
    }
  }

  /**
   * Fetches calendars as an async generator.
   * 
   * This method maintains the original async generator interface while converting
   * GraphCalendar objects to the original Calendar format expected by existing code.
   * 
   * @returns {AsyncGenerator<Calendar>} Async generator yielding Calendar objects
   * @throws {VError} When calendar fetching fails
   * 
   * @example
   * ```typescript
   * for await (const calendar of office365Calendar.getCalendars()) {
   *   console.log('Calendar:', calendar.name);
   * }
   * ```
   */
  async *getCalendars(): AsyncGenerator<Calendar> {
    try {
      for await (const graphCalendar of this.sdk.getCalendars()) {
        // Convert GraphCalendar to original Calendar interface
        const calendar: Calendar = {
          id: graphCalendar.id as string, // Remove branding for backward compatibility
          uid: graphCalendar.id as string,
          name: graphCalendar.name,
          summary: graphCalendar.name, // Google Calendar compatibility
          description: undefined, // Not available in Microsoft Graph
          time_zone: undefined, // Not available in basic calendar info
          access_role: graphCalendar.canEdit ? 'writer' : 'reader',
          primary: false, // Microsoft Graph doesn't have primary concept like Google Calendar
          owner: {
            name: graphCalendar.owner?.name || 'Unknown',
            address: graphCalendar.owner?.address || 'unknown@example.com',
            email: graphCalendar.owner?.address || 'unknown@example.com'
          },
          canEdit: graphCalendar.canEdit || false,
          canShare: graphCalendar.canShare || false,
          canViewPrivateItems: graphCalendar.canViewPrivateItems || false,
          source: 'office365-calendar'
        };
        
        yield calendar;
      }
    } catch (error) {
      this.structuredLogger.error('Failed to fetch calendars', { error: ErrorUtils.getMessage(error) });
      throw new VError(error as Error, 'Failed to fetch calendars from Office 365');
    }
  }

  /**
   * Fetches events from a specific calendar as an async generator.
   * 
   * This method maintains the original async generator interface while converting
   * GraphEvent objects to the original Event format expected by existing code.
   * 
   * @param {string} calendarId - The ID of the calendar to fetch events from
   * @param {Office365CalendarConfig} config - Optional configuration (for backward compatibility)
   * @param {string} userId - Optional user ID for domain-wide delegation
   * @returns {AsyncGenerator<Event>} Async generator yielding Event objects
   * @throws {VError} When event fetching fails
   * 
   * @example
   * ```typescript
   * for await (const event of office365Calendar.getEvents('calendar123')) {
   *   console.log('Event:', event.subject);
   * }
   * ```
   */
  async *getEvents(
    calendarId: string,
    config?: Office365CalendarConfig,
    userId?: string
  ): AsyncGenerator<Event> {
    try {
      const brandedCalendarId = asCalendarId(calendarId);
      const brandedUserId = userId ? asUserId(userId) : undefined;
      
      for await (const graphEvent of this.sdk.getEvents(brandedCalendarId, config, brandedUserId)) {
        // Convert GraphEvent to original Event interface
        const event: Event = {
          id: graphEvent.id,
          uid: graphEvent.id,
          calendarUid: calendarId,
          subject: graphEvent.subject,
          summary: graphEvent.subject, // Google Calendar compatibility
          title: graphEvent.subject,
          body: graphEvent.body ? {
            contentType: graphEvent.body.contentType,
            content: graphEvent.body.content
          } : undefined,
          start: {
            date: graphEvent.start?.date,
            dateTime: graphEvent.start?.dateTime || new Date().toISOString(),
            date_time: graphEvent.start?.dateTime || new Date().toISOString(), // Google Calendar compatibility
            timeZone: graphEvent.start?.timeZone || 'UTC',
            time_zone: graphEvent.start?.timeZone || 'UTC' // Google Calendar compatibility
          },
          end: {
            date: graphEvent.end?.date,
            dateTime: graphEvent.end?.dateTime || new Date().toISOString(),
            date_time: graphEvent.end?.dateTime || new Date().toISOString(), // Google Calendar compatibility
            timeZone: graphEvent.end?.timeZone || 'UTC',
            time_zone: graphEvent.end?.timeZone || 'UTC' // Google Calendar compatibility
          },
          location: graphEvent.location ? (
            typeof graphEvent.location === 'string' 
              ? { displayName: graphEvent.location }
              : { displayName: graphEvent.location.displayName }
          ) : undefined,
          attendees: graphEvent.attendees?.map(attendee => ({
            email: attendee.emailAddress?.address || 'unknown@example.com',
            name: attendee.emailAddress?.name,
            emailAddress: {
              name: attendee.emailAddress?.name || 'Unknown',
              address: attendee.emailAddress?.address || 'unknown@example.com'
            },
            status: {
              response: attendee.status?.response || 'none',
              time: attendee.status?.time || ''
            },
            type: attendee.type || 'required'
          })) || [],
          organizer: graphEvent.organizer ? {
            email: graphEvent.organizer.emailAddress?.address || 'unknown@example.com',
            name: graphEvent.organizer.emailAddress?.name,
            emailAddress: {
              name: graphEvent.organizer.emailAddress?.name || 'Unknown',
              address: graphEvent.organizer.emailAddress?.address || 'unknown@example.com'
            }
          } : undefined,
          startTime: graphEvent.start?.dateTime || new Date().toISOString(),
          endTime: graphEvent.end?.dateTime || new Date().toISOString(),
          categories: graphEvent.categories || [],
          status: graphEvent.isCancelled ? 'cancelled' : 'confirmed',
          showAs: graphEvent.showAs,
          importance: graphEvent.importance,
          sensitivity: graphEvent.sensitivity,
          isAllDay: false, // Would need to be computed from start/end
          isCancelled: graphEvent.isCancelled || false,
          createdAt: graphEvent.createdDateTime || new Date().toISOString(),
          updatedAt: graphEvent.lastModifiedDateTime || new Date().toISOString(),
          createdDateTime: graphEvent.createdDateTime || new Date().toISOString(),
          lastModifiedDateTime: graphEvent.lastModifiedDateTime || new Date().toISOString(),
          source: 'office365',
          // Google Calendar compatibility fields
          visibility: 'default',
          created: graphEvent.createdDateTime || new Date().toISOString(),
          updated: graphEvent.lastModifiedDateTime || new Date().toISOString(),
          creator: graphEvent.organizer ? {
            email: graphEvent.organizer.emailAddress?.address || 'unknown@example.com',
            display_name: graphEvent.organizer.emailAddress?.name
          } : {
            email: 'unknown@example.com'
          }
        };
        
        yield event;
      }
    } catch (error) {
      this.structuredLogger.error('Failed to fetch events for calendar', { 
        calendarId, 
        error: ErrorUtils.getMessage(error) 
      });
      throw new VError(error as Error, `Failed to fetch events for calendar ${calendarId}`);
    }
  }

  /**
   * Fetches incremental event changes as an async generator.
   * 
   * This method maintains the original async generator interface while using
   * the new SDK's delta query functionality underneath.
   * 
   * @param {string} calendarId - The ID of the calendar to fetch changes from
   * @param {string} deltaToken - The delta token from the previous sync
   * @returns {AsyncGenerator<{ event: Event; nextDeltaLink: string }>} Async generator yielding event changes
   * @throws {VError} When incremental sync fails
   * 
   * @example
   * ```typescript
   * for await (const change of office365Calendar.getEventsIncremental('calendar123', 'token')) {
   *   console.log('Event change:', change.event.subject);
   * }
   * ```
   */
  async *getEventsIncremental(
    calendarId: string,
    deltaToken: string
  ): AsyncGenerator<{ event: Event; nextDeltaLink: string }> {
    try {
      const brandedCalendarId = asCalendarId(calendarId);
      const brandedDeltaToken = asDeltaToken(deltaToken);
      
      for await (const eventDelta of this.sdk.getEventsIncremental(brandedCalendarId, brandedDeltaToken)) {
        if ('subject' in eventDelta.event) {
          // Regular event
          const graphEvent = eventDelta.event;
          const event: Event = {
            id: graphEvent.id,
            uid: graphEvent.id,
            calendarUid: calendarId,
            subject: graphEvent.subject,
            summary: graphEvent.subject, // Google Calendar compatibility
            title: graphEvent.subject,
            body: graphEvent.body ? {
              contentType: graphEvent.body.contentType,
              content: graphEvent.body.content
            } : undefined,
            start: {
              date: graphEvent.start?.date,
              dateTime: graphEvent.start?.dateTime || new Date().toISOString(),
              date_time: graphEvent.start?.dateTime || new Date().toISOString(),
              timeZone: graphEvent.start?.timeZone || 'UTC',
              time_zone: graphEvent.start?.timeZone || 'UTC'
            },
            end: {
              date: graphEvent.end?.date,
              dateTime: graphEvent.end?.dateTime || new Date().toISOString(),
              date_time: graphEvent.end?.dateTime || new Date().toISOString(),
              timeZone: graphEvent.end?.timeZone || 'UTC',
              time_zone: graphEvent.end?.timeZone || 'UTC'
            },
            location: graphEvent.location ? (
              typeof graphEvent.location === 'string' 
                ? { displayName: graphEvent.location }
                : { displayName: graphEvent.location.displayName }
            ) : undefined,
            attendees: graphEvent.attendees?.map(attendee => ({
              email: attendee.emailAddress?.address || 'unknown@example.com',
              name: attendee.emailAddress?.name,
              emailAddress: {
                name: attendee.emailAddress?.name || 'Unknown',
                address: attendee.emailAddress?.address || 'unknown@example.com'
              },
              status: {
                response: attendee.status?.response || 'none'
              },
              type: attendee.type || 'required'
            })) || [],
            organizer: graphEvent.organizer ? {
              email: graphEvent.organizer.emailAddress?.address || 'unknown@example.com',
              name: graphEvent.organizer.emailAddress?.name,
              emailAddress: {
                name: graphEvent.organizer.emailAddress?.name || 'Unknown',
                address: graphEvent.organizer.emailAddress?.address || 'unknown@example.com'
              }
            } : undefined,
            startTime: graphEvent.start?.dateTime || new Date().toISOString(),
            endTime: graphEvent.end?.dateTime || new Date().toISOString(),
            categories: graphEvent.categories || [],
            status: graphEvent.isCancelled ? 'cancelled' : 'confirmed',
            showAs: graphEvent.showAs,
            importance: graphEvent.importance,
            sensitivity: graphEvent.sensitivity,
            isAllDay: false,
            isCancelled: graphEvent.isCancelled || false,
            createdAt: graphEvent.createdDateTime || new Date().toISOString(),
            updatedAt: graphEvent.lastModifiedDateTime || new Date().toISOString(),
            createdDateTime: graphEvent.createdDateTime || new Date().toISOString(),
            lastModifiedDateTime: graphEvent.lastModifiedDateTime || new Date().toISOString(),
            source: 'office365',
            // Google Calendar compatibility fields
            visibility: 'default',
            created: graphEvent.createdDateTime || new Date().toISOString(),
            updated: graphEvent.lastModifiedDateTime || new Date().toISOString(),
            creator: graphEvent.organizer ? {
              email: graphEvent.organizer.emailAddress?.address || 'unknown@example.com',
              display_name: graphEvent.organizer.emailAddress?.name
            } : {
              email: 'unknown@example.com'
            }
          };
          
          yield {
            event,
            nextDeltaLink: eventDelta.nextDeltaLink as string
          };
        } else {
          // Deleted event
          if (!eventDelta.event) {
            continue; // Skip if no event data
          }
          const deletedEvent = eventDelta.event as any; // Type assertion for deleted events
          const event: Event = {
            id: deletedEvent.id || 'unknown',
            uid: deletedEvent.id || 'unknown',
            calendarUid: calendarId,
            subject: 'Deleted Event',
            summary: 'Deleted Event', // Google Calendar compatibility
            title: 'Deleted Event',
            description: 'This event was deleted',
            start: {
              dateTime: new Date().toISOString(),
              date_time: new Date().toISOString(), // Google Calendar compatibility
              timeZone: 'UTC',
              time_zone: 'UTC' // Google Calendar compatibility
            },
            end: {
              dateTime: new Date().toISOString(),
              date_time: new Date().toISOString(), // Google Calendar compatibility
              timeZone: 'UTC',
              time_zone: 'UTC' // Google Calendar compatibility
            },
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            isAllDay: false,
            attendees: [],
            organizer: {
              email: 'unknown@example.com',
              name: 'Unknown',
              emailAddress: {
                name: 'Unknown',
                address: 'unknown@example.com'
              }
            },
            categories: [],
            status: 'cancelled',
            showAs: 'free',
            isCancelled: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdDateTime: new Date().toISOString(),
            lastModifiedDateTime: new Date().toISOString(),
            source: 'office365',
            // Google Calendar compatibility fields
            visibility: 'default',
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            creator: {
              email: 'unknown@example.com'
            }
          };
          
          yield {
            event,
            nextDeltaLink: eventDelta.nextDeltaLink as string
          };
        }
      }
    } catch (error) {
      this.structuredLogger.error('Failed to fetch incremental events for calendar', {
        calendarId,
        error: ErrorUtils.getMessage(error)
      });
      throw new VError(error as Error, `Failed to fetch incremental events for calendar ${calendarId}`);
    }
  }

  /**
   * Fetches users for domain-wide delegation scenarios.
   * 
   * This method maintains the original interface while delegating to the new SDK.
   * Only available when domain_wide_delegation is enabled in the configuration.
   * 
   * @returns {AsyncGenerator<{ id: string; mail?: string }>} Async generator yielding user objects
   * @throws {VError} When user fetching fails
   * 
   * @example
   * ```typescript
   * // Only works when domain_wide_delegation is true
   * for await (const user of office365Calendar.getUsers()) {
   *   console.log('User:', user.mail || user.id);
   * }
   * ```
   */
  async *getUsers(): AsyncGenerator<{ id: string; mail?: string }> {
    try {
      for await (const user of this.sdk.getUsers()) {
        yield {
          id: user.id as string, // Remove branding for backward compatibility
          mail: user.mail
        };
      }
    } catch (error) {
      this.structuredLogger.error('Failed to fetch users', { error: ErrorUtils.getMessage(error) });
      throw new VError(error as Error, 'Failed to fetch users from Office 365');
    }
  }

  /**
   * Provides access to the underlying SDK for advanced operations.
   * 
   * This method allows access to the new SDK's advanced features while maintaining
   * backward compatibility for existing code.
   * 
   * @returns {Office365CalendarSDK} The underlying Office365CalendarSDK instance
   * 
   * @example
   * ```typescript
   * const sdk = office365Calendar.getSDK();
   * const result = await sdk.getCalendarsSafe();
   * ```
   */
  getSDK(): Office365CalendarSDK {
    return this.sdk;
  }
}