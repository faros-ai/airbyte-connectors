import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamName,
} from '../converter';
import {GithubCommon} from './common';

export class GithubBranches implements Converter {
  readonly streamName = new StreamName('github', 'branches');
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['vcs_Branch'];

  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const branch = record.record.data;
    const repository = GithubCommon.parseRepositoryKey(
      branch.repository,
      source
    );

    return [
      {
        model: 'vcs_Branch',
        record: {
          name: branch.name,
          repository,
        },
      },
    ];
  }
}
