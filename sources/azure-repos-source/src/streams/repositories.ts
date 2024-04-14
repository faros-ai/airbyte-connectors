import {Dictionary} from 'ts-essentials';

import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
} from '../../../../faros-airbyte-cdk/lib';
import {AzureRepoConfig, AzureRepos} from '../azure-repos';
import {Repository} from '../models';

export class Repositories extends AirbyteStreamBase {
  constructor(
    private readonly config: AzureRepoConfig,
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

  async *readRecords(): AsyncGenerator<Repository> {
    const azureRepos = await AzureRepos.make(this.config, this.logger);
    yield* azureRepos.getRepositories();
  }
}
