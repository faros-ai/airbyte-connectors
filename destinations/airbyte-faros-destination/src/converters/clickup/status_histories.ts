import {AirbyteRecord} from 'faros-airbyte-cdk';
import {StatusHistory} from 'faros-airbyte-common/clickup';
import {sortBy} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ClickUpCommon, ClickUpConverter} from './common';

export class StatusHistories extends ClickUpConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const history = record.record.data as StatusHistory;
    const source = this.streamName.source;
    const taskKey = {uid: history.computedProperties.task.id, source};
    const changelog = sortBy(
      history.status_history ?? [],
      (h) => new Date(Number(h.total_time.since))
    );
    return [
      {
        model: 'tms_Task__Update',
        record: {
          at: Date.now(),
          where: taskKey,
          mask: ['statusChangedAt', 'statusChangelog'],
          patch: {
            statusChangedAt: new Date(
              Number(history.current_status.total_time.since)
            ),
            statusChangelog: changelog.map((c) => {
              return {
                status: {
                  category: ClickUpCommon.statusCategory(c.status),
                  detail: c.status,
                },
                changedAt: new Date(Number(c.total_time.since)),
              };
            }),
          },
        },
      },
    ];
  }
}
