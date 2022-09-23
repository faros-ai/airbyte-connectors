import {AirbyteLogger, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Commit} from 'faros-airbyte-common/bitbucket-server';
import {Dictionary} from 'ts-essentials';

import {BitbucketServerConfig} from '../bitbucket-server';
import {StreamBase} from './common';

type StreamSlice = {project: string; repo: {slug: string; fullName: string}};
type CommitState = {
  [repoFullName: string]: {lastCommitterTimestamp: number; lastId: string};
};

export class Commits extends StreamBase {
  constructor(
    readonly config: BitbucketServerConfig,
    readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any> {
    return require('../../resources/schemas/commits.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  get cursorField(): string | string[] {
    return 'committerTimestamp';
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
    streamState?: CommitState
  ): AsyncGenerator<Commit> {
    const {project, repo} = streamSlice;
    const lastCommitId =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.[repo.fullName]?.lastId
        : undefined;
    yield* this.server.commits(project, repo.slug, lastCommitId);
  }

  getUpdatedState(
    currentStreamState: CommitState,
    latestRecord: Commit
  ): CommitState {
    const repo = latestRecord.computedProperties.repository.fullName;
    const repoState = currentStreamState[repo] ?? null;
    if (
      latestRecord.committerTimestamp > (repoState?.lastCommitterTimestamp ?? 0)
    ) {
      return {
        ...currentStreamState,
        [repo]: {
          lastCommitterTimestamp: latestRecord.committerTimestamp,
          lastId: latestRecord.id,
        },
      };
    }
    return currentStreamState;
  }
}
