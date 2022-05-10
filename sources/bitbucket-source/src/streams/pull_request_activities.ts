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

type StreamSlice = {
  workspace;
  repository: {slug: string; fullName: string};
  prID: string;
  updatedOn: string;
};
type PRActivityState = Dictionary<{cutoff?: string}>;

interface TimestampedPRActivity extends PRActivity {
  pullRequestUpdatedOn: string;
  repoFullName: string;
}

export class PullRequestActivities extends AirbyteStreamBase {
  constructor(
    readonly config: BitbucketConfig,
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
    const bitbucket = Bitbucket.instance(this.config, this.logger);
    for (const workspace of this.config.workspaces) {
      for (const repo of await bitbucket.getRepositories(
        workspace,
        this.config.repositories
      )) {
        const prs = this.pullRequests.readRecords(
          SyncMode.INCREMENTAL,
          undefined,
          {workspace, repository: {slug: repo.slug, fullName: repo.fullName}},
          streamState
        );
        for await (const pr of prs) {
          yield {
            workspace,
            repository: {slug: repo.slug, fullName: repo.fullName},
            prID: pr.id.toString(),
            updatedOn: pr.updatedOn,
          };
        }
      }
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice
  ): AsyncGenerator<TimestampedPRActivity> {
    const bitbucket = Bitbucket.instance(this.config, this.logger);

    const workspace = streamSlice.workspace;
    const repo = streamSlice.repository;
    const prID = streamSlice.prID;
    const activities = bitbucket.getPRActivities(workspace, repo.slug, prID);
    for await (const activity of activities) {
      yield {
        ...activity,
        pullRequestUpdatedOn: streamSlice.updatedOn,
        repoFullName: repo.fullName,
      };
    }
  }

  getUpdatedState(
    currentStreamState: PRActivityState,
    latestRecord: TimestampedPRActivity
  ): PRActivityState {
    const repo = latestRecord.repoFullName;
    const repoState = currentStreamState[repo] ?? {};
    const newRepoState = {
      cutoff:
        new Date(latestRecord.pullRequestUpdatedOn) >
        new Date(repoState.cutoff ?? 0)
          ? latestRecord.pullRequestUpdatedOn
          : repoState.cutoff,
    };
    return {...currentStreamState, [repo]: newRepoState};
  }
}
