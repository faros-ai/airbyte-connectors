import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Project} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class FarosProjects extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Project',
    'tms_TaskBoard',
    'tms_TaskBoardProjectRelationship',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const project = record.record.data as Project;
    const projectKey = {uid: project.id, source: this.streamName.source};
    return [
      {
        model: 'tms_Project',
        record: {
          ...projectKey,
          name: project.name,
          description: Utils.cleanAndTruncate(
            project.body,
            GitHubCommon.MAX_DESCRIPTION_LENGTH
          ),
          createdAt: project.created_at,
          updatedAt: project.updated_at,
        },
      },
      {
        model: 'tms_TaskBoard',
        record: {
          ...projectKey,
          name: project.name,
        },
      },
      {
        model: 'tms_TaskBoardProjectRelationship',
        record: {
          board: projectKey,
          project: projectKey,
        },
      },
    ];
  }
}
