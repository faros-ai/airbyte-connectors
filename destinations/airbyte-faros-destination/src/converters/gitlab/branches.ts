import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitlabCommon, GitlabConverter} from './common';

export class Branches extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Branch',
    'vcs_BranchCommitAssociation',
  ];

  id(record: AirbyteRecord): any {
    return record?.record?.data?.name;
  }

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const branch = record.record.data;
    const res: DestinationRecord[] = [];

    const repository = GitlabCommon.parseRepositoryKey(branch.web_url, source);

    if (!repository) return [];

    res.push({
      model: 'vcs_Branch',
      record: {
        name: branch.name,
        uid: branch.name,
        repository,
      },
    });
    if (branch.commit_id) {
      res.push({
        model: 'vcs_BranchCommitAssociation',
        record: {
          commit: {sha: branch.commit_id, uid: branch.commit_id, repository},
          branch: {name: branch.name, uid: branch.name, repository},
        },
      });
    }
    return res;
  }
}
