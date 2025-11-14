import {AirbyteRecord} from 'faros-airbyte-cdk';
import {FarosIterationOutput} from 'faros-airbyte-common/gitlab';
import {Utils} from 'faros-js-client';
import {DateTime} from 'luxon';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitlabCommon, GitlabConverter} from './common';

export class FarosIterations extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Sprint'];

  id(record: AirbyteRecord): string {
    const iteration = record?.record?.data as FarosIterationOutput;
    return String(iteration?.id);
  }

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const iteration = record.record.data as FarosIterationOutput;
    const res: DestinationRecord[] = [];

    if (!iteration?.id) {
      return [];
    }

    const uid = String(iteration.id);
    const status = this.mapIterationState(iteration.state);

    // Calculate closedAt as end-of-day of due_date
    const endedAt = Utils.toDate(iteration.due_date);
    const closedAt = endedAt
      ? DateTime.fromJSDate(endedAt).setZone('UTC').endOf('day').toJSDate()
      : null;

    res.push({
      model: 'tms_Sprint',
      record: {
        uid,
        name: iteration.title || `Iteration ${iteration.iid}`,
        description: Utils.cleanAndTruncate(
          iteration.description,
          GitlabCommon.MAX_DESCRIPTION_LENGTH
        ),
        state: status,
        startedAt: Utils.toDate(iteration.start_date),
        openedAt: Utils.toDate(iteration.start_date),
        endedAt,
        closedAt,
        source: this.streamName.source,
      },
    });

    return res;
  }

  private mapIterationState(state: number): string | null {
    switch (state) {
      case 1:
        return 'Future';
      case 2:
        return 'Active';
      case 3:
        return 'Closed';
      default:
        return 'Closed';
    }
  }
}
