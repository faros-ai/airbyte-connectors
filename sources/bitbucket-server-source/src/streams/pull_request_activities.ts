import {AirbyteLogger, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {PullRequestActivity} from 'faros-airbyte-common/bitbucket-server';
import {Dictionary} from 'ts-essentials';

import {BitbucketServerConfig} from '../bitbucket-server';
import {StreamBase} from './common';

type StreamSlice = {project: string; repo: {slug: string; fullName: string}};
type PullRequestActivityState = {
  [repoFullName: string]: {lastUpdatedDate: number};
};

export class PullRequestActivities extends StreamBase {
  constructor(
    readonly config: BitbucketServerConfig,
    readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any> {
    return require('../../resources/schemas/pull_request_activities.json');
  }

  get primaryKey(): StreamKey {
    return ['id'];
  }

  get cursorField(): string | string[] {
    return ['computedProperties', 'pullRequest', 'updatedDate'];
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    for (const project of this.config.projects) {
      for (const repo of await this.server.repositories(
        project,
        this.config.repositories
      )) {
        yield {
          project,
          repo: {slug: repo.slug, fullName: repo.computedProperties.fullName},
        };
      }
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField: string[],
    streamSlice: StreamSlice,
    streamState?: PullRequestActivityState
  ): AsyncGenerator<PullRequestActivity> {
    const {project, repo} = streamSlice;
    const lastUpdatedDate =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.[repo.fullName]?.lastUpdatedDate
        : undefined;
    yield* this.server.pullRequestActivities(
      project,
      repo.slug,
      lastUpdatedDate
    );
  }

  getUpdatedState(
    currentStreamState: PullRequestActivityState,
    latestRecord: PullRequestActivity
  ): PullRequestActivityState {
    const repo =
      latestRecord.computedProperties.pullRequest.repository.fullName;
    const repoState = currentStreamState[repo] ?? null;
    const newUpdatedDate =
      latestRecord.computedProperties.pullRequest.updatedDate;
    if (newUpdatedDate > (repoState?.lastUpdatedDate ?? 0)) {
      return {...currentStreamState, [repo]: {lastUpdatedDate: newUpdatedDate}};
    }
    return currentStreamState;
  }
}
