import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {
  Calendar,
  GooglecalendarCommon,
  GooglecalendarConverter,
} from './common';

export class GooglecalendarCalendars extends GooglecalendarConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cal_Calendar',
  ];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const cle = record.record.data as Calendar;

    return [
      {
        model: 'cal_Calendar',
        record: {
          uid: cle.id,
          title: cle.summary?.substring(
            0,
            GooglecalendarCommon.MAX_DESCRIPTION_LENGTH
          ),
          description: cle.description?.substring(
            0,
            GooglecalendarCommon.MAX_DESCRIPTION_LENGTH
          ),
          source,
        },
      },
    ];
  }
}
