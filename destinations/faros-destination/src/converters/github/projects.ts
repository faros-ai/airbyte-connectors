import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GithubCommon, GithubConverter} from './common';

export class GithubProjects extends GithubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Project',
    'tms_TaskBoard',
    'tms_TaskBoardProjectRelationship',
  ];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const project = record.record.data;

    const res = GithubCommon.tms_ProjectBoard_with_TaskBoard(
      {uid: `${project.id}`, source},
      project.name,
      project.body,
      project.created_at,
      project.updated_at
    );

    return res;
  }
}
