import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Commit, Phabricator, PhabricatorConfig} from '../phabricator';

export interface CommitsState {
  latestCommitedAt: number;
}

export class Commits extends AirbyteStreamBase {
  constructor(
    private readonly config: PhabricatorConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/commits.json');
  }
  get primaryKey(): StreamKey {
    throw ['fields', 'identifier'];
  }
  get cursorField(): string[] {
    return ['fields', 'committer', 'epoch'];
  }
  getUpdatedState(
    currentStreamState: CommitsState,
    latestRecord: Commit
  ): CommitsState {
    const latestCommited = currentStreamState?.latestCommitedAt ?? 0;
    const recordCommited = latestRecord?.fields?.committer?.epoch ?? 0;
    currentStreamState.latestCommitedAt = Math.max(
      latestCommited,
      recordCommited
    );
    return currentStreamState;
  }
  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: CommitsState
  ): AsyncGenerator<Commit, any, any> {
    const phabricator = await Phabricator.make(this.config, this.logger);
    const state = syncMode === SyncMode.INCREMENTAL ? streamState : undefined;
    const commitedAt = state?.latestCommitedAt ?? 0;
    yield* phabricator.getCommits(commitedAt);
  }
}
