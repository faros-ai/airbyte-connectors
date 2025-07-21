import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {LocationCollector} from '../common/geo';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {Office365CalendarConverter} from './common';
import {Office365Event} from './models';
import {Office365CalendarCommon} from './office365calendar-common';

/**
 * Events converter for Office 365 Calendar.
 * 
 * This converter transforms Office 365 Calendar event data into Faros models,
 * providing the same functionality as the Google Calendar events converter
 * but for Office 365 data sources.
 */
export class Events extends Office365CalendarConverter {
  private locationCollector: LocationCollector = undefined;
  private usersSeen = new Set<string>();

  /**
   * Destination models that this converter produces.
   * 
   * These models match the Google Calendar converter output to ensure
   * compatibility with existing Faros data structures.
   */
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cal_Event',
    'cal_EventGuestAssociation',
    'cal_User',
    'geo_Address',
    'geo_Coordinates',
    'geo_Location',
  ];

  /**
   * Initialize the location collector for geographic resolution.
   * 
   * @param ctx - Stream context containing configuration and client access
   */
  private initialize(ctx: StreamContext) {
    if (this.locationCollector) {
      return;
    }
    this.locationCollector = new LocationCollector(
      ctx?.config?.source_specific_configs?.office365calendar?.resolve_locations ??
        true,
      ctx.farosClient
    );
  }

  /**
   * Convert an Office 365 Calendar event record to Faros destination records.
   * 
   * This method transforms a single Office 365 event into the appropriate
   * Faros models, creating user records, guest associations, and location
   * data as needed.
   * 
   * @param record - The Airbyte record containing Office 365 event data
   * @param ctx - Stream context with configuration and client access
   * @returns Array of destination records to be written to Faros
   */
  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    this.initialize(ctx);
    const source = this.streamName.source;
    const event = record.record.data as Office365Event;
    const res: DestinationRecord[] = [];

    const eventRef = {
      uid: event.id,
      calendar: {uid: event.calendarId, source},
    };

    // Process attendees
    for (const attendee of event.attendees ?? []) {
      const uid = this.userUid(attendee);
      if (!uid) continue;

      const attendeeRef = {uid, source};
      if (!this.usersSeen.has(uid)) {
        this.usersSeen.add(uid);
        res.push({
          model: 'cal_User',
          record: {
            ...attendeeRef,
            email: attendee.email,
            displayName: attendee.displayName,
          },
        });
      }
      res.push({
        model: 'cal_EventGuestAssociation',
        record: {
          event: eventRef,
          guest: attendeeRef,
          status: Office365CalendarCommon.EventGuestStatus(
            attendee.responseStatus
          ),
        },
      });
    }

    // Process organizer
    let organizerRef = null;
    const organizerUid = this.userUid(event.organizer);

    if (organizerUid) {
      organizerRef = {uid: organizerUid, source};

      if (!this.usersSeen.has(organizerUid)) {
        this.usersSeen.add(organizerUid);
        res.push({
          model: 'cal_User',
          record: {
            ...organizerRef,
            email: event.organizer?.email,
            displayName: event.organizer?.displayName,
          },
        });
      }
    }

    // Process dates and times
    const start = Utils.toDate(
      event?.start?.date
        ? event.start.date.concat('T00:00:00.000Z')
        : event?.start?.dateTime
    );
    const end = Utils.toDate(
      event?.end?.date
        ? event.end.date.concat('T24:00:00.000Z')
        : event?.end?.dateTime
    );
    let durationMs: number;
    if (start && end) {
      durationMs = end.getTime() - start.getTime();
    }

    // Process location
    let location = null;
    if (event.location && !event.location.startsWith('http')) {
      location = await this.locationCollector.collect(event.location);
    }

    // Process conference URL (Teams, Zoom, etc.)
    let conferenceUrl = this.extractConferenceUrl(event);

    res.push({
      model: 'cal_Event',
      record: {
        ...eventRef,
        title: Utils.cleanAndTruncate(
          event.summary,
          Office365CalendarCommon.MAX_DESCRIPTION_LENGTH
        ),
        description: Utils.cleanAndTruncate(
          event.description,
          Office365CalendarCommon.MAX_DESCRIPTION_LENGTH
        ),
        start,
        end,
        timeZone: event?.start?.timeZone ?? event?.end?.timeZone ?? null,
        durationMs,
        url: event.htmlLink,
        location,
        organizer: organizerRef,
        type: Office365CalendarCommon.EventType(null, null, null),
        visibility: Office365CalendarCommon.EventVisibility(event.transparency),
        privacy: Office365CalendarCommon.EventPrivacy(event.visibility),
        status: Office365CalendarCommon.EventStatus(event.status),
        conferenceUrl,
      },
    });
    return res;
  }

  /**
   * Extract conference URL from various sources in the event.
   * 
   * Office 365 events can have conference URLs in different places:
   * - location field (for Teams, Zoom URLs)
   * - specific conference data fields (future enhancement)
   * 
   * @param event - The Office 365 event data
   * @returns Conference URL string or undefined
   */
  private extractConferenceUrl(event: Office365Event): string | undefined {
    // Check if location field contains a URL (Teams, Zoom, etc.)
    if (event.location && event.location.startsWith('http')) {
      return event.location;
    }

    // Future: Could check other Office 365-specific conference fields
    // For now, Office 365 source maps conference URLs to location field
    return undefined;
  }

  /**
   * Generate unique identifier for a user from Office 365 data.
   * 
   * @param user - User object (attendee or organizer)
   * @returns Unique identifier string or undefined
   */
  private userUid(user: any): string | undefined {
    return user?.id || user?.email;
  }

  /**
   * Complete processing and return accumulated location records.
   * 
   * This method is called after all events have been processed to return
   * the geographic location records that were collected during processing.
   * 
   * @param ctx - Stream context (required by base class)
   * @returns Array of location-related destination records
   */
  async onProcessingComplete(ctx: StreamContext): Promise<ReadonlyArray<DestinationRecord>> {
    return this.locationCollector?.convertLocations() ?? [];
  }
}