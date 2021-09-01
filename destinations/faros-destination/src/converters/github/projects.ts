import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamName,
} from '../converter';
import {GithubCommon} from './common';

export class GithubProjects implements Converter {
  readonly streamName = new StreamName('github', 'projects');
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Project'];

  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const project = record.record.data;
    const projectKey = {uid: '' + project.id, source};
    const res = GithubCommon.tms_ProjectBoard_with_TaskBoard(
      projectKey,
      project.name,
      project.body,
      project.created_at,
      project.updated_at
    );

    return res;
  }
}
