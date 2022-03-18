import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {AzureGit, AzureGitConfig} from '../azuregit';
import {Repository} from '../models';

export class Repositories extends AirbyteStreamBase {
  constructor(
    private readonly config: AzureGitConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/repositories.json');
  }
  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>
  ): AsyncGenerator<Repository> {
    const azureGit = await AzureGit.instance(this.config);
    yield* azureGit.getRepositories();
  }
}
