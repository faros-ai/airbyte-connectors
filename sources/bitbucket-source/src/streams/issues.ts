import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Bitbucket} from '../bitbucket';
import {BitbucketConfig, Issue} from '../types';

type StreamSlice = {
  workspace: string;
  repository: {slug: string; fullName: string};
};
type IssueState = Dictionary<{cutoff?: string}>;

export class Issues extends AirbyteStreamBase {
  constructor(
    readonly config: BitbucketConfig,
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

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    const bitbucket = Bitbucket.instance(this.config, this.logger);
    for (const workspace of this.config.workspaces) {
      for (const repo of await bitbucket.getRepositories(
        workspace,
        this.config.repositories
      )) {
        yield {
          workspace,
          repository: {slug: repo.slug, fullName: repo.fullName},
        };
      }
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: IssueState
  ): AsyncGenerator<Issue> {
    const bitbucket = Bitbucket.instance(this.config, this.logger);

    const workspace = streamSlice.workspace;
    const repo = streamSlice.repository;
    const lastUpdated =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.[repo.fullName]?.cutoff
        : undefined;
    yield* bitbucket.getIssues(workspace, repo.slug, lastUpdated);
  }

  getUpdatedState(
    currentStreamState: IssueState,
    latestRecord: Issue
  ): IssueState {
    const repo = latestRecord.repository.fullName;
    const repoState = currentStreamState[repo] ?? {};
    const newRepoState = {
      cutoff:
        new Date(latestRecord.updatedOn) > new Date(repoState.cutoff ?? 0)
          ? latestRecord.updatedOn
          : repoState.cutoff,
    };
    return {...currentStreamState, [repo]: newRepoState};
  }
}
