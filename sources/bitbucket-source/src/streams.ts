import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {createClient} from './bitbucket';
import {BitbucketConfig, Branch, Workspace} from './types';

export class BitbucketBranches extends AirbyteStreamBase {
  constructor(
    readonly config: BitbucketConfig,
    readonly repositories: string[],
    readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../resources/schemas/branches.json');
  }

  get primaryKey(): StreamKey {
    return [];
  }

  async *streamSlices(
    syncMode: SyncMode,
    cursorField?: string[],
    streamState?: Dictionary<any>
  ): AsyncGenerator<Dictionary<any> | undefined> {
    for (const repository of this.repositories) {
      yield {repository};
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any, string>,
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<Branch, any, unknown> {
    const [client, errorMessage] = await createClient(this.config);
    if (!client) {
      this.logger.error(errorMessage);
      return undefined;
    }

    const repo_slug = streamSlice.repository;
    yield* client.getBranches(this.config.workspace, repo_slug);
  }
}

export class BitbucketRepositories extends AirbyteStreamBase {
  constructor(
    readonly config: BitbucketConfig,
    readonly repositories: string[],
    readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../resources/schemas/repositories.json');
  }

  get primaryKey(): StreamKey {
    return ['uuid'];
  }

  async *streamSlices(
    syncMode: SyncMode,
    cursorField?: string[],
    streamState?: Dictionary<any>
  ): AsyncGenerator<Dictionary<any> | undefined> {
    for (const repository of this.repositories) {
      yield {repository};
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any, string>,
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<Dictionary<any, string>, any, unknown> {
    const [client, errorMessage] = await createClient(this.config);
    if (!client) {
      this.logger.error(errorMessage);
      return undefined;
    }

    const repo_slug = streamSlice.repository;
    yield await client.getRepository(this.config.workspace, repo_slug);
  }
}

export class BitbucketWorkspaces extends AirbyteStreamBase {
  constructor(readonly config: BitbucketConfig, logger: AirbyteLogger) {
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

    yield await client.getWorkspace(this.config.workspace);
  }
}
