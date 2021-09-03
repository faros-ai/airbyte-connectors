import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter, DestinationModel, DestinationRecord} from '../converter';
import {GithubCommon} from './common';

export class GithubProjects extends Converter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Project'];

  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const project = record.record.data;

    const res = GithubCommon.tms_ProjectBoard_with_TaskBoard(
      {uid: '' + project.id, source},
      project.name,
      project.body,
      project.created_at,
      project.updated_at
    );

    return res;
  }
}
