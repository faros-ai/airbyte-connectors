import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Deployment} from 'faros-airbyte-common/github';
import {isNil} from 'lodash';
import {DateTime} from 'luxon';
import {Dictionary} from 'ts-essentials';

import {DEFAULT_MAX_DEPLOYMENT_DURATION_DAYS, GitHub} from '../github';
import {
  RepoStreamSlice,
  StreamBase,
  StreamState,
  StreamWithRepoSlices,
} from './common';

export class FarosDeployments extends StreamWithRepoSlices {
  private readonly syncStartedAtPerSlice: Record<string, Date> = {};

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosDeployments.json');
  }

  get primaryKey(): StreamKey {
    return 'databaseId';
  }

  get cursorField(): string | string[] {
    return 'createdAt';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: RepoStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<Deployment> {
    const org = streamSlice?.org;
    const repo = streamSlice?.repo;
    const orgRepoKey = StreamBase.orgRepoKey(org, repo);
    const state = streamState?.[orgRepoKey];
    const startDate =
      syncMode === SyncMode.INCREMENTAL && !isNil(state?.cutoff)
        ? DateTime.fromMillis(state.cutoff)
            .minus({
              days:
                this.config.max_deployment_duration_days ??
                DEFAULT_MAX_DEPLOYMENT_DURATION_DAYS,
            })
            .toJSDate()
        : this.config.startDate;
    if (!this.syncStartedAtPerSlice[orgRepoKey]) {
      this.syncStartedAtPerSlice[orgRepoKey] = new Date();
    }
    const github = await GitHub.instance(this.config, this.logger);
    yield* github.getDeployments(org, repo, startDate);
  }

  /**
   * Deployments API always return records sorted by created_at in descending order
   * and could be updated at any time, so for making incremental syncs possible
   * we assume they need to be completed in the last X days after creation,
   * where X is the max_deployment_duration_days config value
   */
  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: Deployment,
    slice: RepoStreamSlice
  ): StreamState {
    const syncStartedAt =
      this.syncStartedAtPerSlice[StreamBase.orgRepoKey(slice.org, slice.repo)];
    return this.getUpdatedStreamState(
      syncStartedAt,
      currentStreamState,
      StreamBase.orgRepoKey(slice.org, slice.repo)
    );
  }
}
