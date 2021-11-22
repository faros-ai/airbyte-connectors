import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {Event, GooglecalendarConverter} from './common';

interface CategoryRef {
  category: string;
  detail: string;
}

enum EventGuestStatusCategory {
  NEEDS_ACTION = 'NeedsAction',
  ACCEPTED = 'Accepted',
  TENTATIVE = 'Tentative',
  CANCELED = 'Canceled',
  CUSTOM = 'Custom',
}

enum EventTypeCategory {
  REGULAR = 'Regular',
  RECURRING = 'Recurring',
  CUSTOM = 'Custom',
}

enum EventLocationCategory {
  REMOTE = 'Remote',
  IN_PERSON = 'InPerson',
  CUSTOM = 'Custom',
}

enum EventStatusCategory {
  ACCEPTED = 'Accepted',
  TENTATIVE = 'Tentative',
  CANCELED = 'Canceled',
  CUSTOM = 'Custom',
}

enum EventPrivacyCategory {
  PRIVATE = 'Private',
  PUBLIC = 'Public',
  CUSTOM = 'Custom',
}

enum EventVisibilityCategory {
  FREE = 'Free',
  BUSY = 'Busy',
  CUSTOM = 'Custom',
}

export class GooglecalendarEvents extends GooglecalendarConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cal_Event',
    'cal_EventGuestAssociation',
    'cal_User',
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
          status: this.EventGuestStatus(attender.responseStatus),
        },
      });
    });

    let organizerRef;
    if (event.organizer) {
      organizerRef = {uid: event.organizer?.id, source};
      res.push({
        model: 'cal_User',
        record: {
          uid: event.organizer?.id,
          email: event.organizer?.email,
          displayName: event.organizer?.displayName,
          source,
        },
      });
    }

    const start = Utils.toDate(event?.start?.date || event?.start?.dateTime);
    const end = Utils.toDate(event?.end?.date || event?.end?.dateTime);
    let durationMs: number;
    if (start && end) {
      durationMs = end.getTime() - start.getTime();
    }
    res.push({
      model: 'cal_Event',
      record: {
        ...eventRef,
        title: event.summary,
        description: event.description,
        start,
        end,
        durationMs,
        htmlUrl: event.htmlLink,
        type: event.eventType ? this.EventType(event.eventType) : null,
        location: event.location ? this.EventLocation(event.location) : null,
        visibility: event.transparency
          ? this.EventVisibility(event.transparency)
          : null,
        privacy: event.visibility ? this.EventPrivacy(event.visibility) : null,
        status: event.status ? this.EventStatus(event.status) : null,
        organizer: organizerRef,
      },
    });
    return res;
  }

  private EventType(type: string): CategoryRef {
    const detail = type?.toLowerCase();
    if (detail === 'default') {
      return {category: EventTypeCategory.REGULAR, detail};
    }
    if (detail === 'focusTime') {
      return {category: EventTypeCategory.RECURRING, detail};
    }
    return {category: EventTypeCategory.CUSTOM, detail};
  }

  private EventPrivacy(privacy: string): CategoryRef {
    const detail = privacy?.toLowerCase();
    if (detail === 'public') {
      return {category: EventPrivacyCategory.PUBLIC, detail};
    }
    if (detail === 'private' || detail === 'confidential') {
      return {category: EventPrivacyCategory.PRIVATE, detail};
    }
    return {category: EventPrivacyCategory.CUSTOM, detail};
  }

  private EventVisibility(visibility: string): CategoryRef {
    const detail = visibility?.toLowerCase();
    if (detail === 'opaque') {
      return {category: EventVisibilityCategory.BUSY, detail};
    }
    if (detail === 'transparent') {
      return {category: EventVisibilityCategory.FREE, detail};
    }
    return {category: EventVisibilityCategory.CUSTOM, detail};
  }

  private EventStatus(status: string): CategoryRef {
    const detail = status?.toLowerCase();
    if (detail === 'confirmed') {
      return {category: EventStatusCategory.ACCEPTED, detail};
    }
    if (detail === 'tentative') {
      return {category: EventStatusCategory.TENTATIVE, detail};
    }
    if (detail === 'cancelled') {
      return {category: EventStatusCategory.CANCELED, detail};
    }
    return {category: EventStatusCategory.CUSTOM, detail};
  }

  private EventGuestStatus(status: string): CategoryRef {
    const detail = status?.toLowerCase();
    if (detail === 'accepted') {
      return {category: EventGuestStatusCategory.ACCEPTED, detail};
    }
    if (detail === 'tentative') {
      return {category: EventGuestStatusCategory.TENTATIVE, detail};
    }
    if (detail === 'needs_action' || detail === 'needsaction') {
      return {category: EventGuestStatusCategory.NEEDS_ACTION, detail};
    }
    if (detail === 'declined') {
      return {category: EventGuestStatusCategory.CANCELED, detail};
    }
    return {category: EventGuestStatusCategory.CUSTOM, detail};
  }

  private EventLocation(location: string): CategoryRef {
    const detail = location?.toLowerCase();
    if (detail === 'remote') {
      return {category: EventLocationCategory.REMOTE, detail};
    }
    if (detail === 'in_person' || detail === 'inperson') {
      return {category: EventLocationCategory.IN_PERSON, detail};
    }
    return {category: EventLocationCategory.CUSTOM, detail};
  }
}
