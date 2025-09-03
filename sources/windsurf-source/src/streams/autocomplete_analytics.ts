import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {AutocompleteAnalyticsItem, WindsurfConfig} from '../types';
import {Windsurf} from '../windsurf';

type StreamState = {
  cutoff?: string;
};

export class AutocompleteAnalytics extends AirbyteStreamBase {
  constructor(
    private readonly config: WindsurfConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/autocompleteAnalytics.json');
  }

  get primaryKey(): StreamKey {
    return ['email', 'date'];
  }

  get cursorField(): string | string[] {
    return 'date';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: StreamState
  ): AsyncGenerator<AutocompleteAnalyticsItem> {
    const windsurf = Windsurf.instance(this.config, this.logger);

    // For incremental sync, use the cutoff date from state, otherwise use configured date range
    const startDate =
      syncMode === SyncMode.INCREMENTAL && streamState?.cutoff
        ? streamState.cutoff
        : this.config.startDate?.toISOString();

    const endDate = this.config.endDate?.toISOString();

    // Yield items directly from the async generator
    yield* windsurf.getAutocompleteAnalytics(startDate, endDate);
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: AutocompleteAnalyticsItem
  ): StreamState {
    const currentCutoff = currentStreamState?.cutoff;
    const recordDate = latestRecord.date;

    // Update state with the latest date seen
    if (!currentCutoff || recordDate > currentCutoff) {
      return {
        cutoff: recordDate,
      };
    }

    return currentStreamState;
  }
}
