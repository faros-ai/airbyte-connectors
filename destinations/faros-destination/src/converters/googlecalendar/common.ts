import {AirbyteRecord} from 'faros-airbyte-cdk';
import {calendar_v3} from 'googleapis';

import {Converter} from '../converter';

export type Event = calendar_v3.Schema$Event;
export type CalendarListEntry = calendar_v3.Schema$CalendarListEntry;

/** GoogleCalendar converter base */
export abstract class GooglecalendarConverter extends Converter {
  /** Every GoogleCalendar record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}
