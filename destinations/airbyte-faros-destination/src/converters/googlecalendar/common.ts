import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';
import {Schema$Calendar, Schema$Event} from './calendar_models';

export type Event = Schema$Event;
export type Calendar = Schema$Calendar;

export interface CategoryRef {
  category: string;
  detail: string;
}

export enum EventGuestStatusCategory {
  NEEDS_ACTION = 'NeedsAction',
  ACCEPTED = 'Accepted',
  TENTATIVE = 'Tentative',
  CANCELED = 'Canceled',
  CUSTOM = 'Custom',
}

export enum EventTypeCategory {
  REGULAR = 'Regular',
  RECURRING = 'Recurring',
  CUSTOM = 'Custom',
}

export enum EventStatusCategory {
  CONFIRMED = 'Confirmed',
  TENTATIVE = 'Tentative',
  CANCELED = 'Canceled',
  CUSTOM = 'Custom',
}

export enum EventPrivacyCategory {
  PRIVATE = 'Private',
  PUBLIC = 'Public',
  CUSTOM = 'Custom',
}

export enum EventVisibilityCategory {
  FREE = 'Free',
  BUSY = 'Busy',
  CUSTOM = 'Custom',
}

/** Common functions shares across GoogleCalendar converters */
export class GoogleCalendarCommon {
  // Max length for free-form description text fields such as issue body
  static readonly MAX_DESCRIPTION_LENGTH = 1000;

  static EventType(
    recurringEventId: string | null,
    recurrence: string[] | null,
    type: string | null
  ): CategoryRef {
    if (recurringEventId || recurrence) {
      const detail = Array.isArray(recurrence)
        ? recurrence.join(';;')
        : recurrence;
      return {category: EventTypeCategory.RECURRING, detail};
    }

    const detail = type?.toLowerCase();
    if (!detail) return {category: EventTypeCategory.CUSTOM, detail: 'unknown'};

    switch (detail) {
      case 'default':
        return {category: EventTypeCategory.REGULAR, detail};
      default:
        return {category: EventTypeCategory.CUSTOM, detail};
    }
  }

  static EventPrivacy(privacy: string): CategoryRef {
    const detail = privacy?.toLowerCase();
    if (!detail)
      return {category: EventPrivacyCategory.CUSTOM, detail: 'unknown'};

    switch (detail) {
      case 'public':
        return {category: EventPrivacyCategory.PUBLIC, detail};
      case 'private':
      case 'confidential':
        return {category: EventPrivacyCategory.PRIVATE, detail};
      default:
        return {category: EventPrivacyCategory.CUSTOM, detail};
    }
  }

  static EventVisibility(visibility: string): CategoryRef {
    const detail = visibility?.toLowerCase();
    if (!detail) {
      // We default to Busy, since Google Calendar doesn't return visibility value
      // for "opaque" events
      return {category: EventVisibilityCategory.BUSY, detail: 'unknown'};
    }

    switch (detail) {
      case 'opaque':
        return {category: EventVisibilityCategory.BUSY, detail};
      case 'transparent':
        return {category: EventVisibilityCategory.FREE, detail};
      default:
        return {category: EventVisibilityCategory.CUSTOM, detail};
    }
  }

  static EventStatus(status: string): CategoryRef {
    const detail = status?.toLowerCase();
    if (!detail)
      return {category: EventStatusCategory.CUSTOM, detail: 'unknown'};

    switch (detail) {
      case 'confirmed':
        return {category: EventStatusCategory.CONFIRMED, detail};
      case 'tentative':
        return {category: EventStatusCategory.TENTATIVE, detail};
      case 'cancelled':
        return {category: EventStatusCategory.CANCELED, detail};
      default:
        return {category: EventStatusCategory.CUSTOM, detail};
    }
  }

  static EventGuestStatus(status: string): CategoryRef {
    const detail = status?.toLowerCase();
    if (!detail)
      return {category: EventGuestStatusCategory.CUSTOM, detail: 'unknown'};

    switch (detail) {
      case 'accepted':
        return {category: EventGuestStatusCategory.ACCEPTED, detail};
      case 'tentative':
        return {category: EventGuestStatusCategory.TENTATIVE, detail};
      case 'needs_action':
      case 'needsaction':
        return {category: EventGuestStatusCategory.NEEDS_ACTION, detail};
      case 'declined':
      case 'canceled':
        return {category: EventGuestStatusCategory.CANCELED, detail};
      default:
        return {category: EventGuestStatusCategory.CUSTOM, detail};
    }
  }
}

/** GoogleCalendar converter base */
export abstract class GoogleCalendarConverter extends Converter {
  source = 'GoogleCalendar';

  /** Every GoogleCalendar record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}
