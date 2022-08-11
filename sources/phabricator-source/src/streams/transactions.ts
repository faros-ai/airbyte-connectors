import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Phabricator, PhabricatorConfig, Transaction} from '../phabricator';

export interface TransactionsState {
  latestModifiedAt: number;
}

export class Transactions extends AirbyteStreamBase {
  constructor(
    private readonly config: PhabricatorConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/transactions.json');
  }
  get primaryKey(): StreamKey {
    return 'phid';
  }
  get cursorField(): string[] {
    return ['dateModified'];
  }
  getUpdatedState(
    currentStreamState: TransactionsState,
    latestRecord: Transaction
  ): TransactionsState {
    const latestModified = currentStreamState?.latestModifiedAt ?? 0;
    const recordModified = latestRecord.dateModified ?? 0;
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
    streamState?: TransactionsState
  ): AsyncGenerator<Transaction, any, any> {
    const phabricator = Phabricator.instance(this.config, this.logger);
    const state = syncMode === SyncMode.INCREMENTAL ? streamState : undefined;
    const modifiedAt = state?.latestModifiedAt ?? 0;

    // For now we are only interested in revision transactions
    yield* phabricator.getRevisionsTransactions(
      phabricator.repositories,
      modifiedAt
    );
  }
}
