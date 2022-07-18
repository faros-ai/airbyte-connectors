import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Phabricator, PhabricatorConfig, RevisionDiff} from '../phabricator';

export interface RevisionDiffsState {
  latestModifiedAt: number;
}

export class RevisionDiffs extends AirbyteStreamBase {
  constructor(
    private readonly config: PhabricatorConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/revision_diffs.json');
  }
  get primaryKey(): StreamKey {
    return 'id';
  }
  get cursorField(): string[] {
    return ['revision', 'dateModified'];
  }
  getUpdatedState(
    currentStreamState: RevisionDiffsState,
    latestRecord: RevisionDiff
  ): RevisionDiffsState {
    const latestModified = currentStreamState?.latestModifiedAt ?? 0;
    const recordModified = latestRecord.revision.dateModified ?? 0;
    currentStreamState.latestModifiedAt = Math.max(
      latestModified,
      recordModified
    );
    return currentStreamState;
  }
  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: RevisionDiffsState
  ): AsyncGenerator<RevisionDiff, any, any> {
    const phabricator = Phabricator.instance(this.config, this.logger);
    const state = syncMode === SyncMode.INCREMENTAL ? streamState : undefined;
    const modifiedAt = state?.latestModifiedAt ?? 0;

    yield* phabricator.getRevisionDiffs(phabricator.repositories, modifiedAt);
  }
}
