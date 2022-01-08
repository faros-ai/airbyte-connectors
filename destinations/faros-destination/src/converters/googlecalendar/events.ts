import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {Event, GooglecalendarCommon, GooglecalendarConverter} from './common';

export class GooglecalendarEvents extends GooglecalendarConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cal_Event',
    'cal_EventGuestAssociation',
    'cal_User',
    'geo_Address',
    'geo_Location',
  ];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
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

    let organizerRef;
    if (event.organizer) {
      organizerRef = {uid: event.organizer?.id, source};
      res.push({
        model: 'cal_User',
        record: {
          uid: event.organizer?.id || event.organizer?.email,
          email: event.organizer?.email,
          displayName: event.organizer?.displayName,
          source,
        },
      });
    }

    const start = GooglecalendarCommon.getEventDate(event?.start);
    const end = GooglecalendarCommon.getEventDate(event?.end);
    let durationMs: number;
    if (start && end) {
      durationMs = end.getTime() - start.getTime();
    }

    let locationRef;
    if (event.location_geocode) {
      const geo = event.location_geocode;
      locationRef = {uid: geo.uid};

      if (geo.coordinates) {
        res.push({model: 'geo_Coordinates', record: geo.coordinates});
      }
      if (geo.address) {
        res.push({model: 'geo_Address', record: geo.address});
      }

      res.push({
        model: 'geo_Location',
        record: {
          uid: geo.uid,
          name: event.location,
          raw: geo.raw,
          room: geo.room,
          coordinates: geo.coordinates ? geo.coordinates : null,
          address: geo.address ? {uid: geo.address.uid} : null,
        },
      });
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
        type: event.eventType
          ? GooglecalendarCommon.EventType(event.eventType)
          : null,
        location: locationRef ?? null,
        visibility: event.transparency
          ? GooglecalendarCommon.EventVisibility(event.transparency)
          : null,
        privacy: event.visibility
          ? GooglecalendarCommon.EventPrivacy(event.visibility)
          : null,
        status: event.status
          ? GooglecalendarCommon.EventStatus(event.status)
          : null,
        organizer: organizerRef,
      },
    });
    return res;
  }
}
