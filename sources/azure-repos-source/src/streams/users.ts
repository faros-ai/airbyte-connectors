import {Dictionary} from 'ts-essentials';

import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
} from '../../../../faros-airbyte-cdk/lib';
import {AzureRepoConfig, AzureRepos} from '../azure-repos';
import {User} from '../models';

export class Users extends AirbyteStreamBase {
  constructor(
    private readonly config: AzureRepoConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/users.json');
  }

  get primaryKey(): StreamKey {
    return 'principalName';
  }

  async *readRecords(): AsyncGenerator<User> {
    const azureRepo = await AzureRepos.make(this.config, this.logger);
    yield* azureRepo.getUsers();
  }
}
