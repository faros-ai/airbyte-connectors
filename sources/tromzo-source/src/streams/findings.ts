import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  StreamState,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Tromzo} from '../tromzo';
import {Finding, TromzoConfig} from '../types';
import {Utils} from 'faros-js-client';

type StreamSlice = {
  tool: string;
};

export class Findings extends AirbyteStreamBase {
  constructor(
    private readonly config: TromzoConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/findings.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  get cursorField(): string | string[] {
    return 'updated_at';
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    for (const tool of this.config.tools ?? []) {
      yield {tool};
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: Dictionary<any>
  ): AsyncGenerator<Finding> {
    const tromzo = await Tromzo.instance(this.config, this.logger);

    const cutoff =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.[streamSlice.tool]?.cutoff
        : undefined;
    const [startDate] = this.getUpdateRange(cutoff);

    for await (const finding of tromzo.findings(streamSlice.tool, startDate)) {
      yield finding;
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: Finding,
    streamSlice?: StreamSlice
  ): StreamState {
    const latestRecordCutoff = Utils.toDate(latestRecord.dbUpdatedAt);

    const currentState = Utils.toDate(
      currentStreamState?.[streamSlice.tool]?.cutoff ?? 0
    );
    const cutoff =
      latestRecordCutoff > currentState ? latestRecordCutoff : currentState;
    return {
      ...currentStreamState,
      [streamSlice.tool]: {
        cutoff: cutoff.getTime(),
      },
    };
  }

  private getUpdateRange(cutoff?: number): [Date, Date] {
    return [
      cutoff ? Utils.toDate(cutoff) : this.config.startDate,
      this.config.endDate,
    ];
  }
}
