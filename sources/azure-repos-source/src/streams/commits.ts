import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {AzureRepos} from '../azure-repos';
import {AzureRepoConfig, Commit} from '../models';

export class Commits extends AirbyteStreamBase {
  constructor(
    private readonly config: AzureRepoConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/commits.json');
  }

  get primaryKey(): StreamKey {
    return 'commitId';
  }

  get cursorField(): string | string[] {
    return ['committer', 'date'];
  }

  getUpdatedState(
    currentStreamState: Dictionary<any>,
    latestCommit: Commit
  ): Dictionary<any> {
    return {
      cutoff:
        new Date(latestCommit.committer.date) >
        new Date(currentStreamState?.cutoff ?? 0)
          ? latestCommit.committer.date
          : currentStreamState.cutoff,
    };
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: any,
    streamState?: any
  ): AsyncGenerator<Commit> {
    const since =
      syncMode === SyncMode.INCREMENTAL ? streamState?.cutoff : undefined;

    const azureRepos = await AzureRepos.instance<AzureRepos>(
      this.config,
      this.logger
    );
    // TODO: Should use project slices
    yield* azureRepos.getCommits(since, this.config.projects);
  }
}
