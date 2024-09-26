import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {
  Calendar,
  GoogleCalendarCommon,
  GoogleCalendarConverter,
} from './common';

export class Calendars extends GoogleCalendarConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cal_Calendar',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const cle = record.record.data as Calendar;

    return [
      {
        model: 'cal_Calendar',
        record: {
          uid: cle.id,
          title: Utils.cleanAndTruncate(
            cle.summary,
            GoogleCalendarCommon.MAX_DESCRIPTION_LENGTH
          ),
          description: Utils.cleanAndTruncate(
            cle.description,
            GoogleCalendarCommon.MAX_DESCRIPTION_LENGTH
          ),
          source,
        },
      },
    ];
  }
}
