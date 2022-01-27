import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Location, Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {Event, GooglecalendarCommon, GooglecalendarConverter} from './common';

export class GooglecalendarEvents extends GooglecalendarConverter {
  // Locations cache to avoid querying the API for the same location
  private locationsCache = new Map<string, Location>();

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cal_Event',
    'cal_EventGuestAssociation',
    'cal_User',
    'geo_Address',
    'geo_Location',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const event = record.record.data as Event;
    const res: DestinationRecord[] = [];
    const eventRef = {uid: event.id, calendar: {uid: event.id, source}};

    event.attendees?.forEach((attender) => {
      const attenderRef = {uid: attender.id, source};
      res.push({
        model: 'cal_User',
        record: {
          ...attenderRef,
          email: attender.email,
          displayName: attender.displayName,
        },
      });
      res.push({
        model: 'cal_EventGuestAssociation',
        record: {
          event: eventRef,
          guest: attenderRef,
          status: GooglecalendarCommon.EventGuestStatus(
            attender.responseStatus
          ),
        },
      });
    });

    let organizer = null;
    if (event.organizer) {
      organizer = {uid: event.organizer?.id || event.organizer?.email, source};
      res.push({
        model: 'cal_User',
        record: {
          ...organizer,
          email: event.organizer?.email,
          displayName: event.organizer?.displayName,
        },
      });
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
    if (event.location) {
      const cachedLocation = this.locationsCache.get(event.location);
      if (cachedLocation) {
        location = {uid: cachedLocation.uid};
      } else {
        const locations = await ctx.farosClient.geocode(event.location);

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

    res.push({
      model: 'cal_Event',
      record: {
        ...eventRef,
        title: event.summary?.substring(
          0,
          GooglecalendarCommon.MAX_DESCRIPTION_LENGTH
        ),
        description: event.description?.substring(
          0,
          GooglecalendarCommon.MAX_DESCRIPTION_LENGTH
        ),
        start,
        end,
        durationMs,
        url: event.htmlLink,
        location,
        organizer,
        type: GooglecalendarCommon.EventType(event.eventType),
        visibility: GooglecalendarCommon.EventVisibility(event.transparency),
        privacy: GooglecalendarCommon.EventPrivacy(event.visibility),
        status: GooglecalendarCommon.EventStatus(event.status),
      },
    });
    return res;
  }
}
