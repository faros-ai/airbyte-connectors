import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Commit, Phabricator, PhabricatorConfig} from '../phabricator';

export interface CommitsState {
  latestCommittedAt: number;
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
    return ['fields', 'identifier'];
  }
  get cursorField(): string[] {
    return ['fields', 'committer', 'epoch'];
  }
  getUpdatedState(
    currentStreamState: CommitsState,
    latestRecord: Commit
  ): CommitsState {
    const latestCommitted = currentStreamState?.latestCommittedAt ?? 0;
    const recordCommitted = latestRecord?.fields?.committer?.epoch ?? 0;
    currentStreamState.latestCommittedAt = Math.max(
      latestCommitted,
      recordCommitted
    );
    return currentStreamState;
  }
  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: CommitsState
  ): AsyncGenerator<Commit, any, any> {
    const phabricator = Phabricator.instance(this.config, this.logger);
    const state = syncMode === SyncMode.INCREMENTAL ? streamState : undefined;
    const committedAt = state?.latestCommittedAt ?? 0;

    yield* phabricator.getCommits(phabricator.repositories, committedAt);
  }
}
