import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {Edition} from '../../common/types';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';

export class FarosProjects extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Project'];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const project = record.record.data;
    const source = this.initializeSource(ctx);
    const uid = project.key;
    const results: Array<DestinationRecord> = [
      {
        model: 'tms_Project',
        record: {
          uid,
          name: project.name,
          description: Utils.cleanAndTruncate(
            project.description,
            this.truncateLimit(ctx)
          ),
          sourceSystemId: project.id,
          source,
        },
      },
    ];
    if (this.useProjectsAsBoards(ctx)) {
      results.push(
        ...[
          {
            model: 'tms_TaskBoard',
            record: {
              uid,
              name: project.name,
              source,
            },
          },
          {
            model: 'tms_TaskBoardProjectRelationship',
            record: {
              board: {uid, source},
              project: {uid, source},
            },
          },
        ]
      );
      if (
        project.issueSync &&
        ctx?.config?.edition_configs?.edition !== Edition.COMMUNITY
      ) {
        results.push({
          model: 'faros_TmsTaskBoardOptions',
          record: {
            board: {uid, source},
            inclusion: {category: 'Included'},
          },
        });
      }
    }
    return results;
  }
}
