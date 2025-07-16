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
    const source = this.initializeSource(ctx);
    const uid = toString(sprint.id);
    // If the project key is provided and use_projects_as_boards is enabled, we use project as board uid.
    const board =
      sprint.projectKey && this.useProjectsAsBoards(ctx)
        ? {uid: sprint.projectKey, source}
        : {uid: toString(sprint.boardId), source};
    return [
      {
        model: 'tms_Sprint',
        record: {
          uid,
          name: sprint.name,
          description: sprint.goal,
          state: upperFirst(camelCase(sprint.state)),
          startedAt: Utils.toDate(sprint.startDate),
          openedAt: Utils.toDate(sprint.activatedDate ?? sprint.startDate),
          endedAt: Utils.toDate(sprint.endDate),
          closedAt: Utils.toDate(sprint.completeDate),
          source,
        },
      },
      {
        model: 'tms_SprintBoardRelationship',
        record: {
          sprint: {uid, source},
          board,
        },
      },
    ];
  }
}
