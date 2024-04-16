import {AirbyteLogger, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {PullRequest} from 'faros-airbyte-common/bitbucket-server';
import {Dictionary} from 'ts-essentials';

import {BitbucketServerConfig} from '../bitbucket-server';
import {StreamBase} from './common';

type StreamSlice = {projectKey: string; repo: {slug: string; fullName: string}};
type PullRequestState = {
  [repoFullName: string]: {lastUpdatedDate: number};
};

export class PullRequests extends StreamBase {
  constructor(
    readonly config: BitbucketServerConfig,
    readonly logger: AirbyteLogger
  ) {
    super(config, logger);
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
    for await (const project of this.projects()) {
      const projectKey = await this.fetchProjectKey(project.key);
      for (const repo of await this.server.repositories(
        projectKey,
        this.projectRepoFilter
      )) {
        yield {
          projectKey,
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
    const {projectKey, repo} = streamSlice;
    const lastUpdatedDate =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.[repo.fullName]?.lastUpdatedDate
        : undefined;
    const prs = this.server.pullRequests(
      projectKey,
      repo.slug,
      lastUpdatedDate
    );
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
