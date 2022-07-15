import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Phabricator, PhabricatorConfig, Revision} from '../phabricator';

export interface RevisionsState {
  latestModifiedAt: number;
}

export class Revisions extends AirbyteStreamBase {
  constructor(
    private readonly config: PhabricatorConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/revisions.json');
  }
  get primaryKey(): StreamKey {
    return 'phid';
  }
  get cursorField(): string[] {
    return ['fields', 'dateModified'];
  }
  getUpdatedState(
    currentStreamState: RevisionsState,
    latestRecord: Revision
  ): RevisionsState {
    const latestModified = currentStreamState?.latestModifiedAt ?? 0;
    const recordModified = latestRecord.fields?.dateModified ?? 0;
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
    streamState?: RevisionsState
  ): AsyncGenerator<Revision, any, any> {
    const phabricator = Phabricator.instance(this.config, this.logger);
    const state = syncMode === SyncMode.INCREMENTAL ? streamState : undefined;
    const modifiedAt = state?.latestModifiedAt ?? 0;

    for (const revision of await phabricator.getRevisions(
      phabricator.repositories,
      modifiedAt
    )) {
      yield revision;
    }
  }
}
