import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {FilesConfig, FilesReader} from '../files-reader';

const DEFAULT_STREAM_NAME = 'files';

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
    return 'fileName';
  }

  get cursorField(): string | string[] {
    return 'lastModified';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: Dictionary<any>
  ): AsyncGenerator<Dictionary<any, string>> {
    const files = await FilesReader.instance(this.config, this.logger);
    const lastModified =
      syncMode === SyncMode.INCREMENTAL ? streamState?.cutoff : undefined;
    yield* files.readFiles(lastModified, this.logger);
  }

  getUpdatedState(
    currentStreamState: Dictionary<any>,
    latestRecord: Dictionary<any>
  ): Dictionary<any> {
    return {
      cutoff: Math.max(
        currentStreamState.cutoff ?? 0,
        latestRecord.lastModified ?? 0
      ),
    };
  }
}
