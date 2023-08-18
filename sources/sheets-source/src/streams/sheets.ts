import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {SheetsConfig, SheetsReader} from '../sheets-reader';

const DEFAULT_STREAM_NAME = 'sheets';

export class Sheets extends AirbyteStreamBase {
  constructor(
    private readonly config: SheetsConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  get name(): string {
    return this.config.stream_name || DEFAULT_STREAM_NAME;
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/sheets.json');
  }

  get primaryKey(): StreamKey {
    return undefined;
  }

  async *readRecords(): AsyncGenerator<Dictionary<any, string>> {
    const sheets = await SheetsReader.instance(this.config, this.logger);
    yield* sheets.readRows(this.logger);
  }
}
