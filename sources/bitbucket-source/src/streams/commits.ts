import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Bitbucket} from '../bitbucket/bitbucket';
import {BitbucketConfig, Commit} from '../bitbucket/types';

type StreamSlice = {workspace: string; repository: string} | undefined;
type CommitState = {cutoff?: string} | undefined;

export class Commits extends AirbyteStreamBase {
  constructor(
    readonly config: BitbucketConfig,
    readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/commits.json');
  }
  get primaryKey(): StreamKey {
    return 'hash';
  }
  get cursorField(): string | string[] {
    return 'date';
  }

  async *streamSlices(
    syncMode: SyncMode,
    cursorField?: string[],
    streamState?: Dictionary<any>
  ): AsyncGenerator<StreamSlice> {
    const bitbucket = Bitbucket.instance(this.config, this.logger);
    for (const workspace of this.config.workspaces) {
      for await (const repo of bitbucket.getRepositories(workspace)) {
        console.log(workspace + repo.name);
        yield {workspace, repository: repo.name};
      }
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: CommitState
  ): AsyncGenerator<Commit> {
    const bitbucket = Bitbucket.instance(this.config, this.logger);

    const lastUpdated =
      syncMode === SyncMode.INCREMENTAL ? streamState?.cutoff : undefined;
    const workspace = streamSlice.workspace;
    const repoSlug = streamSlice.repository;
    yield* bitbucket.getCommits(workspace, repoSlug, lastUpdated);
  }

  getUpdatedState(
    currentStreamState: CommitState,
    latestRecord: Commit
  ): CommitState {
    return {
      cutoff:
        new Date(latestRecord.date) > new Date(currentStreamState?.cutoff ?? 0)
          ? latestRecord.date
          : currentStreamState.cutoff,
    };
  }
}
