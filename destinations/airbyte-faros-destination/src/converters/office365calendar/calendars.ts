import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {Office365CalendarConverter} from './common';
import {Office365Calendar} from './models';
import {Office365CalendarCommon} from './office365calendar-common';

export class Calendars extends Office365CalendarConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cal_Calendar',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const calendar = record.record.data as Office365Calendar;

    return [
      {
        model: 'cal_Calendar',
        record: {
          uid: calendar.id,
          title: Utils.cleanAndTruncate(
            calendar.summary,
            Office365CalendarCommon.MAX_DESCRIPTION_LENGTH
          ),
          description: Utils.cleanAndTruncate(
            calendar.description,
            Office365CalendarCommon.MAX_DESCRIPTION_LENGTH
          ),
          source,
        },
      },
    ];
  }
}