import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {CascadeLinesItem, WindsurfConfig} from '../types';
import {Windsurf} from '../windsurf';

type StreamState = {
  cutoff?: string;
};

export class CascadeLinesAnalytics extends AirbyteStreamBase {
  constructor(
    private readonly config: WindsurfConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/cascadeLinesAnalytics.json');
  }

  get primaryKey(): StreamKey {
    return ['email', 'day'];
  }

  get cursorField(): string | string[] {
    return 'day';
  }

  async *readRecords(
    syncMode: SyncMode,
    _cursorField?: string[],
    _streamSlice?: Dictionary<any>,
    streamState?: StreamState
  ): AsyncGenerator<CascadeLinesItem> {
    const windsurf = Windsurf.instance(this.config, this.logger);

    // For incremental sync, use the cutoff date from state
    const startDate =
      syncMode === SyncMode.INCREMENTAL && streamState?.cutoff
        ? streamState.cutoff
        : undefined;

    // Yield items directly from the async generator
    yield* windsurf.getCascadeLinesAnalytics(startDate);
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: CascadeLinesItem
  ): StreamState {
    const currentCutoff = currentStreamState?.cutoff;
    const recordDate = latestRecord.day;

    // Update state with the latest date seen
    if (!currentCutoff || recordDate > currentCutoff) {
      return {
        cutoff: recordDate,
      };
    }

    return currentStreamState;
  }
}
