import {AirbyteRecord} from 'faros-airbyte-cdk';
import {camelCase, upperFirst} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';

export class FarosSprints extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Sprint'];
  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const sprint = record.record.data;

    return [
      {
        model: 'tms_Sprint',
        record: {
          uid: String(sprint.id),
          name: sprint.name,
          state: upperFirst(camelCase(sprint.state)),
          startedAt: sprint.startedAt,
          endedAt: sprint.endedAt,
          closedAt: sprint.closedAt,
          source: this.source,
        },
      },
    ];
  }
}
