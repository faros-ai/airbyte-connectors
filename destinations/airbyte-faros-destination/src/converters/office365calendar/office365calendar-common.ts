/**
 * Common functionality and enums for Office 365 Calendar converters.
 * 
 * This module provides shared utilities and status mapping functions
 * that match the Google Calendar converter patterns for compatibility.
 */

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

/**
 * Common functions shared across Office 365 Calendar converters.
 * 
 * This class provides status mapping and categorization functions
 * to transform Office 365 Calendar data into Faros model format.
 */
export class Office365CalendarCommon {
  // Max length for free-form description text fields
  static readonly MAX_DESCRIPTION_LENGTH = 1000;

  /**
   * Map Office 365 event type information to Faros event type category.
   * 
   * @param recurringEventId - ID of the recurring event series (if any)
   * @param recurrence - Recurrence pattern information
   * @param type - Office 365 event type
   * @returns CategoryRef with mapped event type
   */
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

  /**
   * Map Office 365 event privacy/sensitivity to Faros privacy category.
   * 
   * @param privacy - Office 365 privacy/sensitivity level
   * @returns CategoryRef with mapped privacy setting
   */
  static EventPrivacy(privacy: string): CategoryRef {
    const detail = privacy?.toLowerCase();
    if (!detail)
      return {category: EventPrivacyCategory.CUSTOM, detail: 'unknown'};

    switch (detail) {
      case 'public':
      case 'default':
        return {category: EventPrivacyCategory.PUBLIC, detail};
      case 'private':
      case 'confidential':
        return {category: EventPrivacyCategory.PRIVATE, detail};
      default:
        return {category: EventPrivacyCategory.CUSTOM, detail};
    }
  }

  /**
   * Map Office 365 event transparency/showAs to Faros visibility category.
   * 
   * @param visibility - Office 365 transparency or showAs status
   * @returns CategoryRef with mapped visibility setting
   */
  static EventVisibility(visibility: string): CategoryRef {
    const detail = visibility?.toLowerCase();
    if (!detail) {
      // Default to Busy, since Office 365 doesn't return transparency value
      // for "opaque" events (similar to Google Calendar behavior)
      return {category: EventVisibilityCategory.BUSY, detail: 'unknown'};
    }

    switch (detail) {
      case 'opaque':
      case 'busy':
      case 'oof': // Out of office
        return {category: EventVisibilityCategory.BUSY, detail};
      case 'transparent':
      case 'free':
      case 'tentative':
        return {category: EventVisibilityCategory.FREE, detail};
      default:
        return {category: EventVisibilityCategory.CUSTOM, detail};
    }
  }

  /**
   * Map Office 365 event status to Faros event status category.
   * 
   * @param status - Office 365 event status
   * @returns CategoryRef with mapped event status
   */
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
      case 'canceled':
        return {category: EventStatusCategory.CANCELED, detail};
      default:
        return {category: EventStatusCategory.CUSTOM, detail};
    }
  }

  /**
   * Map Office 365 attendee response status to Faros guest status category.
   * 
   * @param status - Office 365 attendee response status
   * @returns CategoryRef with mapped guest response status
   */
  static EventGuestStatus(status: string): CategoryRef {
    const detail = status?.toLowerCase();
    if (!detail)
      return {category: EventGuestStatusCategory.CUSTOM, detail: 'unknown'};

    switch (detail) {
      case 'accepted':
        return {category: EventGuestStatusCategory.ACCEPTED, detail};
      case 'tentative':
        return {category: EventGuestStatusCategory.TENTATIVE, detail};
      case 'needsaction':
      case 'needs_action':
      case 'notresponded':
      case 'not_responded':
        return {category: EventGuestStatusCategory.NEEDS_ACTION, detail};
      case 'declined':
      case 'canceled':
      case 'cancelled':
        return {category: EventGuestStatusCategory.CANCELED, detail};
      default:
        return {category: EventGuestStatusCategory.CUSTOM, detail};
    }
  }
}