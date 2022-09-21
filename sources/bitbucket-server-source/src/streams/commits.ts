import {AirbyteLogger, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {
  BitbucketServerConfig,
  Commit,
  repoFullName,
} from '../bitbucket-server/types';
import {StreamBase} from './common';

type StreamSlice = {project: string; repoSlug: string};
type CommitState = {
  [repoFullName: string]: {latestDate: number; latestHash: string};
};

export class Commits extends StreamBase {
  constructor(readonly config: BitbucketServerConfig, logger: AirbyteLogger) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any> {
    return require('../../resources/schemas/commits.json');
  }

  get primaryKey(): StreamKey {
    return 'hash';
  }

  get cursorField(): string | string[] {
    return 'date';
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    for (const project of this.config.projects) {
      for (const repo of await this.server.repositories(
        project,
        this.config.repositories
      )) {
        yield {project, repoSlug: repo.slug};
      }
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField: string[],
    streamSlice: StreamSlice,
    streamState?: CommitState
  ): AsyncGenerator<Commit> {
    const {project, repoSlug} = streamSlice;
    const latestCommitId =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.[repoFullName(project, repoSlug)]?.latestHash
        : undefined;
    yield* this.server.commits(project, repoSlug, latestCommitId);
  }

  getUpdatedState(
    currentStreamState: CommitState,
    latestRecord: Commit
  ): CommitState {
    const repo = latestRecord.repository.fullName;
    const repoState = currentStreamState[repo] ?? null;
    if (new Date(latestRecord.date) > new Date(repoState?.latestDate ?? 0)) {
      return {
        ...currentStreamState,
        [repo]: {latestDate: latestRecord.date, latestHash: latestRecord.hash},
      };
    }
    return currentStreamState;
  }
}
