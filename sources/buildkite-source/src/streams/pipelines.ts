import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Buildkite, BuildkiteConfig, Pipeline} from '../buildkite/buildkite';

interface PipelineState {
  lastCursor?: string;
}
export class Pipelines extends AirbyteStreamBase {
  constructor(
    private readonly config: BuildkiteConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/pipelines.json');
  }
  get primaryKey(): StreamKey {
    return 'uuid';
  }
  get cursorField(): string | string[] {
    return 'cursor';
  }
  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: PipelineState
  ): AsyncGenerator<Pipeline> {
    const lastCursor =
      syncMode === SyncMode.INCREMENTAL ? streamState?.lastCursor : undefined;
    const buildkite = Buildkite.instance(this.config, this.logger);
    yield* buildkite.getPipelines(lastCursor);
  }

  getUpdatedState(
    currentStreamState: PipelineState,
    latestRecord: Pipeline
  ): PipelineState {
    return {
      lastCursor: latestRecord.cursor,
    };
  }
}
