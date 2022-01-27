import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Bitbucket} from '../bitbucket/bitbucket';
import {BitbucketConfig, Issue} from '../bitbucket/types';

type StreamSlice = {repository?: string} | undefined;
type IssueState = {cutoff?: string} | undefined;

export class Issues extends AirbyteStreamBase {
  constructor(
    readonly config: BitbucketConfig,
    readonly repositories: string[],
    readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/issues.json');
  }
  get primaryKey(): StreamKey {
    return 'id';
  }
  get cursorField(): string | string[] {
    return 'updatedOn';
  }

  async *streamSlices(
    syncMode: SyncMode,
    cursorField?: string[],
    streamState?: Dictionary<any>
  ): AsyncGenerator<StreamSlice> {
    for (const repository of this.repositories) {
      yield {repository};
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<Issue> {
    const bitbucket = Bitbucket.instance(this.config, this.logger);

    const lastUpdated =
      syncMode === SyncMode.INCREMENTAL ? streamState?.cutoff : undefined;
    const repoSlug = streamSlice.repository;
    yield* bitbucket.getIssues(repoSlug, lastUpdated);
  }

  getUpdatedState(
    currentStreamState: IssueState,
    latestRecord: Issue
  ): IssueState {
    return {
      cutoff:
        new Date(latestRecord.updatedOn) >
        new Date(currentStreamState?.cutoff ?? 0)
          ? latestRecord.updatedOn
          : currentStreamState.cutoff,
    };
  }
}
