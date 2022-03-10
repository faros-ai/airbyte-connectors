import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Bitbucket} from '../bitbucket/bitbucket';
import {BitbucketConfig, PRActivity} from '../bitbucket/types';
import {PullRequests} from './pull_requests';

type StreamSlice = {repository?: string; pullRequestId?: string} | undefined;

export class PullRequestActivities extends AirbyteStreamBase {
  constructor(
    readonly config: BitbucketConfig,
    readonly repositories: string[],
    readonly pullRequestIds: string[],
    readonly pullRequests: PullRequests,
    readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/pull_request_activities.json');
  }
  get primaryKey(): StreamKey {
    return '';
  }

  async *streamSlices(
    syncMode: SyncMode,
    cursorField?: string[],
    streamState?: Dictionary<any>
  ): AsyncGenerator<StreamSlice> {
    for (const repository of this.repositories) {
      for (const prID of this.pullRequestIds) {
        yield {repository, pullRequestId: prID};
      }
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<PRActivity> {
    const bitbucket = Bitbucket.instance(this.config, this.logger);

    const repoSlug = streamSlice.repository;
    const prID = streamSlice.pullRequestId;
    yield* bitbucket.getPRActivities(repoSlug, prID);
  }
}
