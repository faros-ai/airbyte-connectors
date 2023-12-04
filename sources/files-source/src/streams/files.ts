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
    return undefined;
  }

  async *readRecords(): AsyncGenerator<Dictionary<any, string>> {
    const files = await FilesReader.instance(this.config, this.logger);
    yield* files.readFiles(this.logger);
  }
}
