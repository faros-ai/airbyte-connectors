import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {camelCase, toString, upperFirst} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';

export class FarosSprints extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Sprint',
    'tms_SprintBoardRelationship',
  ];
  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const sprint = record.record.data;
    const source = this.streamName.source;
    const uid = toString(sprint.id);
    return [
      {
        model: 'tms_Sprint',
        record: {
          uid,
          name: sprint.name,
          state: upperFirst(camelCase(sprint.state)),
          startedAt: Utils.toDate(sprint.startDate),
          endedAt: Utils.toDate(sprint.endDate),
          closedAt: Utils.toDate(sprint.completeDate),
          source,
        },
      },
      {
        model: 'tms_SprintBoardRelationship',
        record: {
          sprint: {uid, source},
          board: {uid: toString(sprint.originBoardId)},
        },
      },
    ];
  }
}
