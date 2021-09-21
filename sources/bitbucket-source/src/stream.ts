import {
  AirbyteConfig,
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {createClient, Repository, Workspace} from './bitbucket';

export class BitbucketWorkspaces extends AirbyteStreamBase {
  constructor(readonly config: AirbyteConfig, logger: AirbyteLogger) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../resources/schemas/workspaces.json');
  }

  get primaryKey(): StreamKey {
    return ['uuid'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Workspace,
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<Workspace, any, unknown> {
    const [client, errorMessage] = await createClient(this.config);
    if (!client) {
      this.logger.error(errorMessage);
      return undefined;
    }

    const workspace = await client.getWorkspace(this.config.workspace);
    yield workspace;
  }
}

export class BitbucketRepositories extends AirbyteStreamBase {
  constructor(readonly config: AirbyteConfig, logger: AirbyteLogger) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../resources/schemas/repositories.json');
  }

  get primaryKey(): StreamKey {
    return ['uuid'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Repository,
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<Repository, any, unknown> {
    const [client, errorMessage] = await createClient(this.config);
    if (!client) {
      this.logger.error(errorMessage);
      return undefined;
    }

    const iter = client.getRepositories(this.config.workspace);
    yield* iter;
  }
}
