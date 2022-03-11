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

type StreamSlice = {repository: string; prID: string; updatedOn: string};
type PRActivityState = {cutoff?: string};

interface TimestampedPRActivity extends PRActivity {
  pullRequestUpdatedOn: string;
}

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

  get cursorField(): string | string[] {
    return 'pullRequestUpdatedOn';
  }

  async *streamSlices(
    syncMode: SyncMode,
    cursorField?: string[],
    streamState?: Dictionary<any>
  ): AsyncGenerator<StreamSlice> {
    for (const repository of this.repositories) {
      const prs = this.pullRequests.readRecords(
        SyncMode.INCREMENTAL,
        undefined,
        {repository},
        streamState
      );
      for await (const pr of prs) {
        yield {
          repository,
          prID: pr.id.toString(),
          updatedOn: pr.updatedOn,
        };
      }
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<TimestampedPRActivity> {
    const bitbucket = Bitbucket.instance(this.config, this.logger);

    const repoSlug = streamSlice.repository;
    const prID = streamSlice.prID;
    const activities = bitbucket.getPRActivities(repoSlug, prID);
    for await (const activity of activities) {
      yield {...activity, pullRequestUpdatedOn: streamSlice.updatedOn};
    }
  }

  getUpdatedState(
    currentStreamState: PRActivityState,
    latestRecord: TimestampedPRActivity
  ): PRActivityState {
    return {
      cutoff:
        new Date(latestRecord.pullRequestUpdatedOn) >
        new Date(currentStreamState?.cutoff ?? 0)
          ? latestRecord.pullRequestUpdatedOn
          : currentStreamState.cutoff,
    };
  }
}
