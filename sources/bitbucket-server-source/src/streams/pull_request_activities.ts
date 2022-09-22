import {AirbyteLogger, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {PullRequestActivity} from 'faros-airbyte-common/lib/bitbucket-server/types';
import {Dictionary} from 'ts-essentials';

import {Config} from '../bitbucket-server';
import {StreamBase} from './common';

type StreamSlice = {project: string; repo: {slug: string; fullName: string}};
type PullRequestActivityState = {
  [repoFullName: string]: {lastUpdatedOn: number};
};

export class PullRequestActivities extends StreamBase {
  constructor(readonly config: Config, readonly logger: AirbyteLogger) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any> {
    return require('../../resources/schemas/pull_request_activities.json');
  }

  get primaryKey(): StreamKey {
    return [['destination', 'repository', 'fullName'], ['id']];
  }

  get cursorField(): string | string[] {
    return 'updatedOn';
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    for (const project of this.config.projects) {
      for (const repo of await this.server.repositories(
        project,
        this.config.repositories
      )) {
        yield {project, repo: {slug: repo.slug, fullName: repo.fullName}};
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
    const lastUpdated =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.[repo.fullName]?.lastUpdatedOn
        : undefined;
    yield* this.server.pullRequestActivities(project, repo.slug, lastUpdated);
  }
}
