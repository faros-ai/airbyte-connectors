import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {createClient} from './bitbucket';
import {BitbucketConfig, Branch, Repository, Workspace} from './types';

export class BitbucketBranches extends AirbyteStreamBase {
  constructor(readonly config: BitbucketConfig, logger: AirbyteLogger) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../resources/schemas/branches.json');
  }

  get primaryKey(): StreamKey {
    return [];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Branch,
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<Branch, any, unknown> {
    const [client, errorMessage] = await createClient(this.config);
    if (!client) {
      this.logger.error(errorMessage);
      return undefined;
    }

    const repos = (this.config.repoList || '').split(',').map((r) => r.trim());
    for (const repo of repos) {
      const iter = client.getBranches(this.config.workspace, repo);
      yield* iter;
    }
  }
}

export class BitbucketRepositories extends AirbyteStreamBase {
  constructor(readonly config: BitbucketConfig, logger: AirbyteLogger) {
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

    const repos = (this.config.repoList || '').split(',').map((r) => r.trim());
    const iter = client.getRepositories(this.config.workspace, repos);
    yield* iter;
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

    const workspace = await client.getWorkspace(this.config.workspace);
    yield workspace;
  }
}
