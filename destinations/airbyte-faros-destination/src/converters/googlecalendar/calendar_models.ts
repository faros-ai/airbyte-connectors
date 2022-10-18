export interface Schema$Event {
  /**
   * Whether anyone can invite themselves to the event (deprecated). Optional. The default is False.
   */
  anyoneCanAddSelf?: boolean | null;
  /**
   * File attachments for the event. Currently only Google Drive attachments are supported.
   * In order to modify attachments the supportsAttachments request parameter should be set to true.
   * There can be at most 25 attachments per event,
   */
  attachments?: Schema$EventAttachment[];
  /**
   * The attendees of the event. See the Events with attendees guide for more information on scheduling events with other calendar users. Service accounts need to use domain-wide delegation of authority to populate the attendee list.
   */
  attendees?: Schema$EventAttendee[];
  /**
   * Whether attendees may have been omitted from the event's representation. When retrieving an event, this may be due to a restriction specified by the maxAttendee query parameter. When updating an event, this can be used to only update the participant's response. Optional. The default is False.
   */
  attendeesOmitted?: boolean | null;
  /**
   * Calendar ID the event belongs to
   */
  calendarId?: string | null;
  /**
   * The color of the event. This is an ID referring to an entry in the event section of the colors definition (see the  colors endpoint). Optional.
   */
  colorId?: string | null;
  /**
   * The conference-related information, such as details of a Google Meet conference. To create new conference details use the createRequest field. To persist your changes, remember to set the conferenceDataVersion request parameter to 1 for all event modification requests.
   */
  conferenceData?: Schema$ConferenceData;
  /**
   * Creation time of the event (as a RFC3339 timestamp). Read-only.
   */
  created?: string | null;
  /**
   * The creator of the event. Read-only.
   */
  creator?: {
    displayName?: string;
    email?: string;
    id?: string;
    self?: boolean;
  } | null;
  /**
   * Description of the event. Can contain HTML. Optional.
   */
  description?: string | null;
  /**
   * The (exclusive) end time of the event. For a recurring event, this is the end time of the first instance.
   */
  end?: Schema$EventDateTime;
  /**
   * Whether the end time is actually unspecified. An end time is still provided for compatibility reasons, even if this attribute is set to True. The default is False.
   */
  endTimeUnspecified?: boolean | null;
  /**
   * ETag of the resource.
   */
  etag?: string | null;
  /**
   * Specific type of the event. Read-only. Possible values are:
   * - "default" - A regular event or not further specified.
   * - "outOfOffice" - An out-of-office event.
   */
  eventType?: string | null;
  /**
   * Extended properties of the event.
   */
  extendedProperties?: {
    private?: {
      [key: string]: string;
    };
    shared?: {
      [key: string]: string;
    };
  } | null;
  /**
   * A gadget that extends this event. Gadgets are deprecated; this structure is instead only used for returning birthday calendar metadata.
   */
  gadget?: {
    display?: string;
    height?: number;
    iconLink?: string;
    link?: string;
    preferences?: {
      [key: string]: string;
    };
    title?: string;
    type?: string;
    width?: number;
  } | null;
  /**
   * Whether attendees other than the organizer can invite others to the event. Optional. The default is True.
   */
  guestsCanInviteOthers?: boolean | null;
  /**
   * Whether attendees other than the organizer can modify the event. Optional. The default is False.
   */
  guestsCanModify?: boolean | null;
  /**
   * Whether attendees other than the organizer can see who the event's attendees are. Optional. The default is True.
   */
  guestsCanSeeOtherGuests?: boolean | null;
  /**
   * An absolute link to the Google Hangout associated with this event. Read-only.
   */
  hangoutLink?: string | null;
  /**
   * An absolute link to this event in the Google Calendar Web UI. Read-only.
   */
  htmlLink?: string | null;
  /**
   * Event unique identifier as defined in RFC5545. It is used to uniquely identify events accross calendaring systems and must be supplied when importing events via the import method.
   * Note that the icalUID and the id are not identical and only one of them should be supplied at event creation time. One difference in their semantics is that in recurring events, all occurrences of one event have different ids while they all share the same icalUIDs.
   */
  iCalUID?: string | null;
  /**
   * Opaque identifier of the event. When creating new single or recurring events, you can specify their IDs. Provided IDs must follow these rules:
   * - characters allowed in the ID are those used in base32hex encoding, i.e. lowercase letters a-v and digits 0-9, see section 3.1.2 in RFC2938
   * - the length of the ID must be between 5 and 1024 characters
   * - the ID must be unique per calendar  Due to the globally distributed nature of the system, we cannot guarantee that ID collisions will be detected at event creation time. To minimize the risk of collisions we recommend using an established UUID algorithm such as one described in RFC4122.
   * If you do not specify an ID, it will be automatically generated by the server.
   * Note that the icalUID and the id are not identical and only one of them should be supplied at event creation time. One difference in their semantics is that in recurring events, all occurrences of one event have different ids while they all share the same icalUIDs.
   */
  id?: string | null;
  /**
   * Type of the resource ("calendar#event").
   */
  kind?: string | null;
  /**
   * Geographic location of the event as free-form text. Optional.
   */
  location?: string | null;
  /**
   * Whether this is a locked event copy where no changes can be made to the main event fields "summary", "description", "location", "start", "end" or "recurrence". The default is False. Read-Only.
   */
  locked?: boolean | null;
  /**
   * The organizer of the event. If the organizer is also an attendee, this is indicated with a separate entry in attendees with the organizer field set to True. To change the organizer, use the move operation. Read-only, except when importing an event.
   */
  organizer?: {
    displayName?: string;
    email?: string;
    id?: string;
    self?: boolean;
  } | null;
  /**
   * For an instance of a recurring event, this is the time at which this event would start according to the recurrence data in the recurring event identified by recurringEventId. It uniquely identifies the instance within the recurring event series even if the instance was moved to a different time. Immutable.
   */
  originalStartTime?: Schema$EventDateTime;
  /**
   * If set to True, Event propagation is disabled. Note that it is not the same thing as Private event properties. Optional. Immutable. The default is False.
   */
  privateCopy?: boolean | null;
  /**
   * List of RRULE, EXRULE, RDATE and EXDATE lines for a recurring event, as specified in RFC5545. Note that DTSTART and DTEND lines are not allowed in this field; event start and end times are specified in the start and end fields. This field is omitted for single events or instances of recurring events.
   */
  recurrence?: string[] | null;
  /**
   * For an instance of a recurring event, this is the id of the recurring event to which this instance belongs. Immutable.
   */
  recurringEventId?: string | null;
  /**
   * Information about the event's reminders for the authenticated user.
   */
  reminders?: {
    overrides?: Schema$EventReminder[];
    useDefault?: boolean;
  } | null;
  /**
   * Sequence number as per iCalendar.
   */
  sequence?: number | null;
  /**
   * Source from which the event was created. For example, a web page, an email message or any document identifiable by an URL with HTTP or HTTPS scheme. Can only be seen or modified by the creator of the event.
   */
  source?: {
    title?: string;
    url?: string;
  } | null;
  /**
   * The (inclusive) start time of the event. For a recurring event, this is the start time of the first instance.
   */
  start?: Schema$EventDateTime;
  /**
   * Status of the event. Optional. Possible values are:
   * - "confirmed" - The event is confirmed. This is the default status.
   * - "tentative" - The event is tentatively confirmed.
   * - "cancelled" - The event is cancelled (deleted). The list method returns cancelled events only on incremental sync (when syncToken or updatedMin are specified) or if the showDeleted flag is set to true. The get method always returns them.
   * A cancelled status represents two different states depending on the event type:
   * - Cancelled exceptions of an uncancelled recurring event indicate that this instance should no longer be presented to the user. Clients should store these events for the lifetime of the parent recurring event.
   * Cancelled exceptions are only guaranteed to have values for the id, recurringEventId and originalStartTime fields populated. The other fields might be empty.
   * - All other cancelled events represent deleted events. Clients should remove their locally synced copies. Such cancelled events will eventually disappear, so do not rely on them being available indefinitely.
   * Deleted events are only guaranteed to have the id field populated.   On the organizer's calendar, cancelled events continue to expose event details (summary, location, etc.) so that they can be restored (undeleted). Similarly, the events to which the user was invited and that they manually removed continue to provide details. However, incremental sync requests with showDeleted set to false will not return these details.
   * If an event changes its organizer (for example via the move operation) and the original organizer is not on the attendee list, it will leave behind a cancelled event where only the id field is guaranteed to be populated.
   */
  status?: string | null;
  /**
   * Title of the event.
   */
  summary?: string | null;
  /**
   * Whether the event blocks time on the calendar. Optional. Possible values are:
   * - "opaque" - Default value. The event does block time on the calendar. This is equivalent to setting Show me as to Busy in the Calendar UI.
   * - "transparent" - The event does not block time on the calendar. This is equivalent to setting Show me as to Available in the Calendar UI.
   */
  transparency?: string | null;
  /**
   * Last modification time of the event (as a RFC3339 timestamp). Read-only.
   */
  updated?: string | null;
  /**
   * Visibility of the event. Optional. Possible values are:
   * - "default" - Uses the default visibility for events on the calendar. This is the default value.
   * - "public" - The event is public and event details are visible to all readers of the calendar.
   * - "private" - The event is private and only event attendees may view event details.
   * - "confidential" - The event is private. This value is provided for compatibility reasons.
   */
  visibility?: string | null;
}

export interface Schema$Calendar {
  /**
   * Conferencing properties for this calendar, for example what types of conferences are allowed.
   */
  conferenceProperties?: Schema$ConferenceProperties;
  /**
   * Description of the calendar. Optional.
   */
  description?: string | null;
  /**
   * ETag of the resource.
   */
  etag?: string | null;
  /**
   * Identifier of the calendar. To retrieve IDs call the calendarList.list() method.
   */
  id?: string | null;
  /**
   * Type of the resource ("calendar#calendar").
   */
  kind?: string | null;
  /**
   * Geographic location of the calendar as free-form text. Optional.
   */
  location?: string | null;
  /**
   * Title of the calendar.
   */
  summary?: string | null;
  /**
   * The time zone of the calendar. (Formatted as an IANA Time Zone Database name, e.g. "Europe/Zurich".) Optional.
   */
  timeZone?: string | null;
}

interface Schema$ConferenceData {
  /**
   * The ID of the conference.
   * Can be used by developers to keep track of conferences, should not be displayed to users.
   * The ID value is formed differently for each conference solution type:
   * - eventHangout: ID is not set. (This conference type is deprecated.)
   * - eventNamedHangout: ID is the name of the Hangout. (This conference type is deprecated.)
   * - hangoutsMeet: ID is the 10-letter meeting code, for example aaa-bbbb-ccc.
   * - addOn: ID is defined by the third-party provider.  Optional.
   */
  conferenceId?: string | null;
  /**
   * The conference solution, such as Google Meet.
   * Unset for a conference with a failed create request.
   * Either conferenceSolution and at least one entryPoint, or createRequest is required.
   */
  conferenceSolution?: Schema$ConferenceSolution;
  /**
   * A request to generate a new conference and attach it to the event. The data is generated asynchronously. To see whether the data is present check the status field.
   * Either conferenceSolution and at least one entryPoint, or createRequest is required.
   */
  createRequest?: Schema$CreateConferenceRequest;
  /**
   * Information about individual conference entry points, such as URLs or phone numbers.
   * All of them must belong to the same conference.
   * Either conferenceSolution and at least one entryPoint, or createRequest is required.
   */
  entryPoints?: Schema$EntryPoint[];
  /**
   * Additional notes (such as instructions from the domain administrator, legal notices) to display to the user. Can contain HTML. The maximum length is 2048 characters. Optional.
   */
  notes?: string | null;
  /**
   * Additional properties related to a conference. An example would be a solution-specific setting for enabling video streaming.
   */
  parameters?: Schema$ConferenceParameters;
  /**
   * The signature of the conference data.
   * Generated on server side. Must be preserved while copying the conference data between events, otherwise the conference data will not be copied.
   * Unset for a conference with a failed create request.
   * Optional for a conference with a pending create request.
   */
  signature?: string | null;
}

interface Schema$ConferenceParameters {
  /**
   * Additional add-on specific data.
   */
  addOnParameters?: Schema$ConferenceParametersAddOnParameters;
}

interface Schema$ConferenceParametersAddOnParameters {
  parameters?: {
    [key: string]: string;
  } | null;
}

interface Schema$ConferenceProperties {
  /**
   * The types of conference solutions that are supported for this calendar.
   * The possible values are:
   * - "eventHangout"
   * - "eventNamedHangout"
   * - "hangoutsMeet"  Optional.
   */
  allowedConferenceSolutionTypes?: string[] | null;
}

interface Schema$ConferenceRequestStatus {
  /**
   * The current status of the conference create request. Read-only.
   * The possible values are:
   * - "pending": the conference create request is still being processed.
   * - "success": the conference create request succeeded, the entry points are populated.
   * - "failure": the conference create request failed, there are no entry points.
   */
  statusCode?: string | null;
}

interface Schema$ConferenceSolution {
  /**
   * The user-visible icon for this solution.
   */
  iconUri?: string | null;
  /**
   * The key which can uniquely identify the conference solution for this event.
   */
  key?: Schema$ConferenceSolutionKey;
  /**
   * The user-visible name of this solution. Not localized.
   */
  name?: string | null;
}

interface Schema$ConferenceSolutionKey {
  /**
   * The conference solution type.
   * If a client encounters an unfamiliar or empty type, it should still be able to display the entry points. However, it should disallow modifications.
   * The possible values are:
   * - "eventHangout" for Hangouts for consumers (deprecated; existing events may show this conference solution type but new conferences cannot be created)
   * - "eventNamedHangout" for classic Hangouts for Google Workspace users (deprecated; existing events may show this conference solution type but new conferences cannot be created)
   * - "hangoutsMeet" for Google Meet (http://meet.google.com)
   * - "addOn" for 3P conference providers
   */
  type?: string | null;
}

interface Schema$CreateConferenceRequest {
  /**
   * The conference solution, such as Hangouts or Google Meet.
   */
  conferenceSolutionKey?: Schema$ConferenceSolutionKey;
  /**
   * The client-generated unique ID for this request.
   * Clients should regenerate this ID for every new request. If an ID provided is the same as for the previous request, the request is ignored.
   */
  requestId?: string | null;
  /**
   * The status of the conference create request.
   */
  status?: Schema$ConferenceRequestStatus;
}

interface Schema$EntryPoint {
  /**
   * The access code to access the conference. The maximum length is 128 characters.
   * When creating new conference data, populate only the subset of {meetingCode, accessCode, passcode, password, pin\} fields that match the terminology that the conference provider uses. Only the populated fields should be displayed.
   * Optional.
   */
  accessCode?: string | null;
  /**
   * Features of the entry point, such as being toll or toll-free. One entry point can have multiple features. However, toll and toll-free cannot be both set on the same entry point.
   */
  entryPointFeatures?: string[] | null;
  /**
   * The type of the conference entry point.
   * Possible values are:
   * - "video" - joining a conference over HTTP. A conference can have zero or one video entry point.
   * - "phone" - joining a conference by dialing a phone number. A conference can have zero or more phone entry points.
   * - "sip" - joining a conference over SIP. A conference can have zero or one sip entry point.
   * - "more" - further conference joining instructions, for example additional phone numbers. A conference can have zero or one more entry point. A conference with only a more entry point is not a valid conference.
   */
  entryPointType?: string | null;
  /**
   * The label for the URI. Visible to end users. Not localized. The maximum length is 512 characters.
   * Examples:
   * - for video: meet.google.com/aaa-bbbb-ccc
   * - for phone: +1 123 268 2601
   * - for sip: 12345678@altostrat.com
   * - for more: should not be filled
   * Optional.
   */
  label?: string | null;
  /**
   * The meeting code to access the conference. The maximum length is 128 characters.
   * When creating new conference data, populate only the subset of {meetingCode, accessCode, passcode, password, pin\} fields that match the terminology that the conference provider uses. Only the populated fields should be displayed.
   * Optional.
   */
  meetingCode?: string | null;
  /**
   * The passcode to access the conference. The maximum length is 128 characters.
   * When creating new conference data, populate only the subset of {meetingCode, accessCode, passcode, password, pin\} fields that match the terminology that the conference provider uses. Only the populated fields should be displayed.
   */
  passcode?: string | null;
  /**
   * The password to access the conference. The maximum length is 128 characters.
   * When creating new conference data, populate only the subset of {meetingCode, accessCode, passcode, password, pin\} fields that match the terminology that the conference provider uses. Only the populated fields should be displayed.
   * Optional.
   */
  password?: string | null;
  /**
   * The PIN to access the conference. The maximum length is 128 characters.
   * When creating new conference data, populate only the subset of {meetingCode, accessCode, passcode, password, pin\} fields that match the terminology that the conference provider uses. Only the populated fields should be displayed.
   * Optional.
   */
  pin?: string | null;
  /**
   * The CLDR/ISO 3166 region code for the country associated with this phone access. Example: "SE" for Sweden.
   * Calendar backend will populate this field only for EntryPointType.PHONE.
   */
  regionCode?: string | null;
  /**
   * The URI of the entry point. The maximum length is 1300 characters.
   * Format:
   * - for video, http: or https: schema is required.
   * - for phone, tel: schema is required. The URI should include the entire dial sequence (e.g., tel:+12345678900,,,123456789;1234).
   * - for sip, sip: schema is required, e.g., sip:12345678@myprovider.com.
   * - for more, http: or https: schema is required.
   */
  uri?: string | null;
}

interface Schema$EventAttachment {
  /**
   * ID of the attached file. Read-only.
   * For Google Drive files, this is the ID of the corresponding Files resource entry in the Drive API.
   */
  fileId?: string | null;
  /**
   * URL link to the attachment.
   * For adding Google Drive file attachments use the same format as in alternateLink property of the Files resource in the Drive API.
   * Required when adding an attachment.
   */
  fileUrl?: string | null;
  /**
   * URL link to the attachment's icon. Read-only.
   */
  iconLink?: string | null;
  /**
   * Internet media type (MIME type) of the attachment.
   */
  mimeType?: string | null;
  /**
   * Attachment title.
   */
  title?: string | null;
}

interface Schema$EventAttendee {
  /**
   * Number of additional guests. Optional. The default is 0.
   */
  additionalGuests?: number | null;
  /**
   * The attendee's response comment. Optional.
   */
  comment?: string | null;
  /**
   * The attendee's name, if available. Optional.
   */
  displayName?: string | null;
  /**
   * The attendee's email address, if available. This field must be present when adding an attendee. It must be a valid email address as per RFC5322.
   * Required when adding an attendee.
   */
  email?: string | null;
  /**
   * The attendee's Profile ID, if available.
   */
  id?: string | null;
  /**
   * Whether this is an optional attendee. Optional. The default is False.
   */
  optional?: boolean | null;
  /**
   * Whether the attendee is the organizer of the event. Read-only. The default is False.
   */
  organizer?: boolean | null;
  /**
   * Whether the attendee is a resource. Can only be set when the attendee is added to the event for the first time. Subsequent modifications are ignored. Optional. The default is False.
   */
  resource?: boolean | null;
  /**
   * The attendee's response status. Possible values are:
   * - "needsAction" - The attendee has not responded to the invitation.
   * - "declined" - The attendee has declined the invitation.
   * - "tentative" - The attendee has tentatively accepted the invitation.
   * - "accepted" - The attendee has accepted the invitation.
   */
  responseStatus?: string | null;
  /**
   * Whether this entry represents the calendar on which this copy of the event appears. Read-only. The default is False.
   */
  self?: boolean | null;
}

interface Schema$EventDateTime {
  /**
   * The date, in the format "yyyy-mm-dd", if this is an all-day event.
   */
  date?: string | null;
  /**
   * The time, as a combined date-time value (formatted according to RFC3339). A time zone offset is required unless a time zone is explicitly specified in timeZone.
   */
  dateTime?: string | null;
  /**
   * The time zone in which the time is specified. (Formatted as an IANA Time Zone Database name, e.g. "Europe/Zurich".) For recurring events this field is required and specifies the time zone in which the recurrence is expanded. For single events this field is optional and indicates a custom time zone for the event start/end.
   */
  timeZone?: string | null;
}

interface Schema$EventReminder {
  /**
   * The method used by this reminder. Possible values are:
   * - "email" - Reminders are sent via email.
   * - "popup" - Reminders are sent via a UI popup.
   * Required when adding a reminder.
   */
  method?: string | null;
  /**
   * Number of minutes before the start of the event when the reminder should trigger. Valid values are between 0 and 40320 (4 weeks in minutes).
   * Required when adding a reminder.
   */
  minutes?: number | null;
}

interface Schema$EventReminder {
  /**
   * The method used by this reminder. Possible values are:
   * - "email" - Reminders are sent via email.
   * - "popup" - Reminders are sent via a UI popup.
   * Required when adding a reminder.
   */
  method?: string | null;
  /**
   * Number of minutes before the start of the event when the reminder should trigger. Valid values are between 0 and 40320 (4 weeks in minutes).
   * Required when adding a reminder.
   */
  minutes?: number | null;
}
