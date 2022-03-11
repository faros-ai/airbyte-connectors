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
    readonly pullRequests: PullRequests,
    readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/pull_request_activities.json');
  }

  get primaryKey(): StreamKey | undefined {
    return undefined;
  }

  async *streamSlices(
    syncMode: SyncMode,
    cursorField?: string[],
    streamState?: Dictionary<any>
  ): AsyncGenerator<StreamSlice> {
    for (const repository of this.repositories) {
      const prs = this.pullRequests.readRecords(
        SyncMode.FULL_REFRESH,
        undefined,
        {repository}
      );
      for await (const pr of prs) {
        yield {repository, pullRequestId: pr.id.toString()};
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
