import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Location, Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {Event, GoogleCalendarCommon, GoogleCalendarConverter} from './common';

export class Events extends GoogleCalendarConverter {
  // Locations cache to avoid querying the API for the same location
  private locationsCache = new Map<string, Location>();

  private usersSeen = new Set<string>();

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cal_Event',
    'cal_EventGuestAssociation',
    'cal_User',
    'geo_Address',
    'geo_Coordinates',
    'geo_Location',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const event = record.record.data as Event;
    const res: DestinationRecord[] = [];

    const eventRef = {
      uid: event.id,
      calendar: {uid: event.calendarId, source},
    };

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
          status: GoogleCalendarCommon.EventGuestStatus(
            attendee.responseStatus
          ),
        },
      });
    }

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

    let location = null;
    if (event.location && !event.location.startsWith('http')) {
      const cachedLocation = this.locationsCache.get(event.location);
      if (cachedLocation) {
        location = {uid: cachedLocation.uid};
      } else {
        const locations = await ctx.farosClient?.geocode(event.location);

        if (locations.length > 0) {
          const loc = locations[0];
          this.locationsCache.set(event.location, loc);

          if (loc.coordinates) {
            res.push({model: 'geo_Coordinates', record: loc.coordinates});
          }
          if (loc.address) {
            res.push({model: 'geo_Address', record: loc.address});
          }
          const geo_Location = {
            uid: loc.uid,
            name: loc.raw,
            raw: loc.raw,
            room: loc.room,
            coordinates: loc.coordinates ? loc.coordinates : null,
            address: loc.address ? {uid: loc.address.uid} : null,
          };
          res.push({model: 'geo_Location', record: geo_Location});
          location = {uid: loc.uid};
        }
      }
    }

    let conferenceUrl = event?.hangoutLink;
    if (!conferenceUrl) {
      for (const entryPoint of event.conferenceData?.entryPoints ?? []) {
        if (entryPoint?.entryPointType === 'video' && entryPoint?.uri) {
          conferenceUrl = entryPoint?.uri;
          break;
        }
      }
    } else if (event.location && event.location.startsWith('http')) {
      conferenceUrl = event.location;
    }

    res.push({
      model: 'cal_Event',
      record: {
        ...eventRef,
        title: Utils.cleanAndTruncate(
          event.summary,
          GoogleCalendarCommon.MAX_DESCRIPTION_LENGTH
        ),
        description: Utils.cleanAndTruncate(
          event.description,
          GoogleCalendarCommon.MAX_DESCRIPTION_LENGTH
        ),
        start,
        end,
        timeZone: event?.start?.timeZone ?? event?.end?.timeZone ?? null,
        durationMs,
        url: event.htmlLink,
        location,
        organizer: organizerRef,
        type: GoogleCalendarCommon.EventType(
          event.recurringEventId,
          event.recurrence,
          event.eventType
        ),
        visibility: GoogleCalendarCommon.EventVisibility(event.transparency),
        privacy: GoogleCalendarCommon.EventPrivacy(event.visibility),
        status: GoogleCalendarCommon.EventStatus(event.status),
        conferenceUrl,
      },
    });
    return res;
  }

  private userUid(user: any): string | undefined {
    return user?.id || user?.email;
  }
}
