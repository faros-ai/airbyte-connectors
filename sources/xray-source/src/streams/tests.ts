import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Test} from 'faros-airbyte-common/xray';
import {Dictionary} from 'ts-essentials';

import {XrayConfig} from '../types';
import {Xray} from '../xray';

export class Tests extends AirbyteStreamBase {
  constructor(
    private readonly config: XrayConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/tests.json');
  }

  get primaryKey(): StreamKey {
    return ['issueId'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: Dictionary<any>
  ): AsyncGenerator<Test> {
    const xrayClient = await Xray.instance(this.config, this.logger);
    yield* xrayClient.getTests();
  }
}
