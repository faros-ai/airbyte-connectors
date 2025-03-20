import {AirbyteRecord} from 'faros-airbyte-cdk';
import {RepositoryLanguage} from 'faros-airbyte-common/github';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class FarosRepositoryLanguages extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'faros_Tag',
    'vcs_RepositoryTag',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const repoLanguage = record.record.data as RepositoryLanguage;
    if (!repoLanguage.bytes) {
      return [];
    }
    const tagKey = {
      uid: `github__${repoLanguage.org}__${repoLanguage.repo}__${repoLanguage.language}__bytes`,
    };
    const repoKey = GitHubCommon.repoKey(
      repoLanguage.org,
      repoLanguage.repo,
      this.streamName.source
    );
    return [
      {
        model: 'faros_Tag',
        record: {
          tag: {
            ...tagKey,
            key: `Language__${repoLanguage.language}`,
            value: repoLanguage.bytes.toString(),
          },
        },
      },
      {
        model: 'vcs_RepositoryTag',
        record: {
          tag: tagKey,
          repository: repoKey,
        },
      },
    ];
  }
}
