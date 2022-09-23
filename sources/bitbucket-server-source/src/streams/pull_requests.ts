import {AirbyteLogger, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {PullRequest} from 'faros-airbyte-common/bitbucket-server';
import {Dictionary} from 'ts-essentials';

import {BitbucketServerConfig} from '../bitbucket-server';
import {StreamBase} from './common';

type StreamSlice = {project: string; repo: {slug: string; fullName: string}};
type PullRequestState = {
  [repoFullName: string]: {lastUpdatedDate: number};
};

export class PullRequests extends StreamBase {
  constructor(
    readonly config: BitbucketServerConfig,
    readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any> {
    return require('../../resources/schemas/pull_requests.json');
  }

  get primaryKey(): StreamKey {
    return [['computedProperties', 'repository', 'fullName'], ['id']];
  }

  get cursorField(): string | string[] {
    return 'updatedDate';
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
    const lastUpdatedDate =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.[repo.fullName]?.lastUpdatedDate
        : undefined;
    const prs = this.server.pullRequests(project, repo.slug, lastUpdatedDate);
    for (const pr of await prs) {
      yield pr;
    }
  }

  getUpdatedState(
    currentStreamState: PullRequestState,
    latestRecord: PullRequest
  ): PullRequestState {
    const repo = latestRecord.computedProperties.repository.fullName;
    const repoState = currentStreamState[repo] ?? null;
    if (latestRecord.updatedDate > (repoState?.lastUpdatedDate ?? 0)) {
      return {
        ...currentStreamState,
        [repo]: {lastUpdatedDate: latestRecord.updatedDate},
      };
    }
    return currentStreamState;
  }
}
