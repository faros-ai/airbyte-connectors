import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class Projects extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Project',
    'tms_TaskBoard',
    'tms_TaskBoardProjectRelationship',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const project = record.record.data;

    const res = GitHubCommon.tms_ProjectBoard_with_TaskBoard(
      {uid: `${project.id}`, source},
      project.name,
      project.body,
      project.created_at,
      project.updated_at
    );

    return res;
  }
}
