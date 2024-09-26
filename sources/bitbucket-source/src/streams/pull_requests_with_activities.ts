import {AirbyteLogger, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {PullRequestOrActivity} from 'faros-airbyte-common/bitbucket';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {Bitbucket} from '../bitbucket';
import {BitbucketConfig} from '../types';
import {
  RepoStreamSlice,
  StreamBase,
  StreamState,
  StreamWithRepoSlices,
} from './common';

export class PullRequestsWithActivities extends StreamWithRepoSlices {
  constructor(
    readonly config: BitbucketConfig,
    readonly logger: AirbyteLogger,
    readonly emitActivities: boolean = false
  ) {
    super(config, logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/pull_requests_with_activities.json');
  }

  get dependencies(): string[] {
    return ['commits'];
  }

  get primaryKey(): StreamKey {
    return [['pullRequest', 'id']];
  }

  get cursorField(): string | string[] {
    return ['pullRequest', 'updatedOn'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: RepoStreamSlice,
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<PullRequestOrActivity> {
    const bitbucket = Bitbucket.instance(this.config, this.logger);
    const workspace = streamSlice.workspace;
    const repo = streamSlice.repo;
    const state = streamState?.[StreamBase.workspaceRepoKey(workspace, repo)];
    const [startDate, endDate] =
      syncMode === SyncMode.INCREMENTAL
        ? this.getUpdateRange(state?.cutoff)
        : this.getUpdateRange();
    yield* bitbucket.getPullRequestsWithActivities(
      workspace,
      repo,
      startDate,
      endDate,
      this.emitActivities
    );
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: PullRequestOrActivity,
    streamSlice: RepoStreamSlice
  ): StreamState {
    if (latestRecord.type === 'PullRequestActivity') {
      return currentStreamState;
    }
    const latestRecordCutoff = Utils.toDate(
      latestRecord?.pullRequest?.updatedOn ?? 0
    );
    return this.getUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      StreamBase.workspaceRepoKey(streamSlice.workspace, streamSlice.repo)
    );
  }
}
