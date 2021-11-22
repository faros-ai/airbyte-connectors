import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {CalendarListEntry, GooglecalendarConverter} from './common';

export class GooglecalendarCalendarListEntries extends GooglecalendarConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cal_Calendar',
  ];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const cle = record.record.data as CalendarListEntry;

    return [
      {
        model: 'cal_Calendar',
        record: {
          uid: cle.id,
          title: cle.summary,
          description: cle.description,
          source,
        },
      },
    ];
  }
}
