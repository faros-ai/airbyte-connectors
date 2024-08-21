import {AirbyteLogger, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {PRActivity} from 'faros-airbyte-common/bitbucket';
import {Dictionary} from 'ts-essentials';

import {Bitbucket} from '../bitbucket';
import {BitbucketConfig} from '../types';
import {StreamBase} from './common';
import {PullRequests} from './pull_requests';

type StreamSlice = {
  workspace;
  repoSlug: string;
  prID: string;
  updatedOn: string;
};
type PRActivityState = Dictionary<{cutoff?: string}>;

interface TimestampedPRActivity extends PRActivity {
  pullRequestUpdatedOn: string;
}

export class PullRequestActivities extends StreamBase {
  constructor(
    readonly config: BitbucketConfig,
    readonly pullRequests: PullRequests,
    readonly logger: AirbyteLogger
  ) {
    super(config, logger);
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
    const workspaces = await this.workspaceRepoFilter.getWorkspaces();
    for (const workspace of workspaces) {
      const repos = await this.workspaceRepoFilter.getRepositories(workspace);
      for (const repo of repos) {
        const prs = this.pullRequests.readRecords(
          SyncMode.INCREMENTAL,
          undefined,
          {workspace, repo: repo.slug},
          streamState
        );
        for await (const pr of prs) {
          yield {
            workspace,
            repoSlug: repo.slug,
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
    const repoSlug = streamSlice.repoSlug;
    const prID = streamSlice.prID;
    const activities = bitbucket.getPRActivities(workspace, repoSlug, prID);
    for await (const activity of activities) {
      yield {...activity, pullRequestUpdatedOn: streamSlice.updatedOn};
    }
  }

  getUpdatedState(
    currentStreamState: PRActivityState,
    latestRecord: TimestampedPRActivity
  ): PRActivityState {
    const repo = `${latestRecord.pullRequest.workspace}/${latestRecord.pullRequest.repositorySlug}`;
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
