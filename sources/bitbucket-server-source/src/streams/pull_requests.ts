import {AirbyteLogger, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {PullRequest} from 'faros-airbyte-common/lib/bitbucket-server/types';
import {Dictionary} from 'ts-essentials';

import {Config} from '../bitbucket-server';
import {StreamBase} from './common';

type StreamSlice = {project: string; repo: {slug: string; fullName: string}};
type PullRequestState = {
  [repoFullName: string]: {lastUpdatedOn: number};
};

export class PullRequests extends StreamBase {
  constructor(readonly config: Config, readonly logger: AirbyteLogger) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any> {
    return require('../../resources/schemas/pull_requests.json');
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
    streamState?: PullRequestState
  ): AsyncGenerator<PullRequest> {
    const {project, repo} = streamSlice;
    const lastUpdatedOn =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.[repo.fullName]?.lastUpdatedOn
        : undefined;
    const prs = this.server.pullRequests(project, repo.slug, lastUpdatedOn);
    for (const pr of await prs) {
      yield pr;
    }
  }

  getUpdatedState(
    currentStreamState: PullRequestState,
    latestRecord: PullRequest
  ): PullRequestState {
    const repo = latestRecord.destination.repository.fullName;
    const repoState = currentStreamState[repo] ?? null;
    if (latestRecord.updatedOn > (repoState?.lastUpdatedOn ?? 0)) {
      return {
        ...currentStreamState,
        [repo]: {lastUpdatedOn: latestRecord.updatedOn},
      };
    }
    return currentStreamState;
  }
}
