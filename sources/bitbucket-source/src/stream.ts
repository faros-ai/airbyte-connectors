import {
  AirbyteConfig,
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {createClient} from './bitbucket';

export class BitbucketWorkspace extends AirbyteStreamBase {
  constructor(readonly config: AirbyteConfig, logger: AirbyteLogger) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../resources/schemas/workspace.json');
  }

  get primaryKey(): StreamKey {
    return ['uid'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any, string>,
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<Dictionary<any, string>, any, unknown> {
    const [client, _] = await createClient(this.config);
    const workspace = await client.getWorkspace(this.config.workspace);
    yield workspace;
  }
}
