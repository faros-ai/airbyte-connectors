import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitlabCommon, GitlabConverter} from './common';

export class GitlabBranches extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Branch',
    'vcs_BranchCommitAssociation',
  ];

  id(record: AirbyteRecord): any {
    return record?.record?.data?.name;
  }

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const branch = record.record.data;
    const res: DestinationRecord[] = [];

    const repository = GitlabCommon.parseRepositoryKey(branch.web_url, source);

    if (!repository) return [];

    res.push({
      model: 'vcs_Branch',
      record: {
        name: branch.name,
        repository,
      },
    });
    if (branch.commit) {
      res.push({
        model: 'vcs_BranchCommitAssociation',
        record: {
          commit: {sha: branch.commit.id, repository},
          branch: {name: branch.name, repository},
        },
      });
    }
    return res;
  }
}
