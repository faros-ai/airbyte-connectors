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
  lastDate?: string;
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
    return ['api_key', 'date'];
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

    // For incremental sync, use the last date from state
    const startDate =
      syncMode === SyncMode.INCREMENTAL && streamState?.lastDate
        ? streamState.lastDate
        : undefined;

    const items = await windsurf.getAutocompleteAnalytics(startDate);

    for (const item of items) {
      yield item;
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: AutocompleteAnalyticsItem
  ): StreamState {
    const currentLastDate = currentStreamState?.lastDate;
    const recordDate = latestRecord.date;

    // Update state with the latest date seen
    if (!currentLastDate || recordDate > currentLastDate) {
      return {
        lastDate: recordDate,
      };
    }

    return currentStreamState;
  }
}
