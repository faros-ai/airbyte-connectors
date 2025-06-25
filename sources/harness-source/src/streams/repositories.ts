import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {DateTime} from 'luxon';
import {Dictionary} from 'ts-essentials';

import {DEFAULT_CUTOFF_DAYS, Harness} from '../harness';
import {HarnessConfig, RepositoryNode, RepositoryState} from '../harness_models';

export class Repositories extends AirbyteStreamBase {
  constructor(
    private readonly config: HarnessConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/repositories.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  get cursorField(): string | string[] {
    return 'createdAt';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: RepositoryNode,
    streamState?: RepositoryState
  ): AsyncGenerator<RepositoryNode> {
    const harness = Harness.instance(this.config, this.logger);

    let since: number = null;
    if (syncMode === SyncMode.INCREMENTAL) {
      const lastCreatedAt = streamState?.lastCreatedAt;
      const defaultCutoffDate: number = DateTime.now()
        .minus({days: this.config.cutoff_days || DEFAULT_CUTOFF_DAYS})
        .toMillis();
      /** If we have already synced repositories, ignore cutoffDays
        and get everything since last sync to avoid gaps in data. Instead
        of sync repositories from cutoff days*/
      since = lastCreatedAt ? lastCreatedAt : defaultCutoffDate;
    }

    yield* harness.getRepositories(since);
  }

  getUpdatedState(
    currentStreamState: RepositoryState,
    latestRecord: RepositoryNode
  ): RepositoryState {
    const latestCreatedAt = currentStreamState?.lastCreatedAt || 0;
    const recordCreatedAt = latestRecord?.createdAt || 0;
    return {
      lastCreatedAt: Math.max(latestCreatedAt, recordCreatedAt),
    };
  }
}