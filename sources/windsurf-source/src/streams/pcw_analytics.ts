import {AirbyteLogger, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {PCWAnalyticsItem, WindsurfConfig} from '../types';
import {Windsurf} from '../windsurf';
import {StreamBase} from './common';

type PCWStreamState = {
  cutoff: string;
};

export class PCWAnalytics extends StreamBase {
  constructor(config: WindsurfConfig, logger: AirbyteLogger) {
    super(config, logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/pcwAnalytics.json');
  }

  get primaryKey(): StreamKey {
    return 'date';
  }

  get cursorField(): string | string[] {
    return 'date';
  }

  async *readRecords(
    syncMode: SyncMode,
    _cursorField?: string[],
    _streamSlice?: undefined,
    streamState?: PCWStreamState
  ): AsyncGenerator<PCWAnalyticsItem> {
    const windsurf = Windsurf.instance(this.config, this.logger);

    // For incremental sync, use the cutoff date from state, otherwise use configured date range
    const startDate =
      syncMode === SyncMode.INCREMENTAL && streamState?.cutoff
        ? new Date(streamState.cutoff)
        : this.config.startDate;
    const endDate = this.config.endDate;

    // Yield items directly from the async generator
    yield* windsurf.getPCWAnalytics(startDate, endDate);
  }

  getUpdatedState(
    currentStreamState: PCWStreamState,
    latestRecord: PCWAnalyticsItem
  ): PCWStreamState {
    const recordDate = latestRecord.date;

    // Update state with the latest date seen
    if (!currentStreamState?.cutoff || recordDate > currentStreamState.cutoff) {
      return {
        cutoff: recordDate,
      };
    }

    return currentStreamState;
  }
}
