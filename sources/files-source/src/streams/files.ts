import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {
  FileProcessingStrategy,
  FilesConfig,
  FilesReader,
  OutputRecord,
} from '../files-reader';

const DEFAULT_STREAM_NAME = 'files';

type StreamState = {
  lastFileName: string;
};

export class Files extends AirbyteStreamBase {
  constructor(
    private readonly config: FilesConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  get name(): string {
    return this.config.stream_name || DEFAULT_STREAM_NAME;
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/files.json');
  }

  get primaryKey(): StreamKey {
    return ['fileName', 'chunkNumber'];
  }

  get cursorField(): string | string[] {
    return 'fileName';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: StreamState
  ): AsyncGenerator<OutputRecord> {
    const files = await FilesReader.instance(this.config, this.logger);
    const lastFileName =
      syncMode === SyncMode.INCREMENTAL &&
      this.config.files_source?.file_processing_strategy ===
        FileProcessingStrategy.IMMUTABLE_LEXICOGRAPHICAL_ORDER
        ? streamState?.lastFileName
        : undefined;
    yield* files.readFiles(this.logger, lastFileName);
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: OutputRecord
  ): StreamState {
    if (!currentStreamState?.lastFileName) {
      return {lastFileName: latestRecord.fileName};
    }

    return {
      lastFileName:
        currentStreamState.lastFileName > latestRecord.fileName
          ? currentStreamState.lastFileName
          : latestRecord.fileName,
    };
  }
}
