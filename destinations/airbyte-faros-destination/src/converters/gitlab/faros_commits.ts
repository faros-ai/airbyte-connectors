import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Commit} from 'faros-airbyte-common/gitlab';
import {Utils} from 'faros-js-client';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitlabConverter} from './common';

export class FarosCommits extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['vcs_Commit'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const commit = record.record.data as Commit;

    const repository = {
      name: toLower(commit.project_path),
      uid: toLower(commit.project_path),
      organization: {
        uid: commit.group_id,
        source,
      },
    };

    const author = commit.author_username
      ? {uid: commit.author_username, source}
      : null;

    return [
      {
        model: 'vcs_Commit',
        record: {
          sha: commit.id,
          uid: commit.id,
          message: commit.message,
          author,
          htmlUrl: commit.web_url,
          createdAt: Utils.toDate(commit.created_at),
          repository,
        },
      },
    ];
  }
}
