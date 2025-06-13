import {
  StreamKey,
  StreamState,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {Codacy} from '../codacy';
import {CodacyConfig, CodacyMetrics} from '../types';
import {CodacyStreamBase, StreamSlice} from './base';

export class Metrics extends CodacyStreamBase {
  constructor(config: CodacyConfig, logger: any) {
    super(config, logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/metrics.json');
  }

  get primaryKey(): StreamKey {
    return ['repositoryId', 'commitSha'];
  }

  get cursorField(): string | string[] {
    return 'createdAt';
  }



  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: Dictionary<any>
  ): AsyncGenerator<CodacyMetrics> {
    if (!streamSlice) return;
    
    const codacy = await Codacy.instance(this.config, this.logger);
    const repository = streamSlice.repository;

    const cutoff = syncMode === SyncMode.INCREMENTAL
      ? streamState?.[repository.id]?.cutoff
      : undefined;
    const [startDate] = this.getUpdateRange(cutoff);

    for await (const metric of codacy.getRepositoryMetrics(repository.id, startDate)) {
      yield metric;
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: CodacyMetrics,
    streamSlice?: StreamSlice
  ): StreamState {
    if (!streamSlice) return currentStreamState;
    
    const latestRecordCutoff = Utils.toDate(latestRecord.createdAt);
    return this.getUpdatedStateForRepository(currentStreamState, latestRecordCutoff, streamSlice.repository.id);
  }
}
