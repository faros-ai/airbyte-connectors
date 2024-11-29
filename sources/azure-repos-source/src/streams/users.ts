import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

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

  // Although not actually an incremental stream, we run it in incremental mode
  // to avoid deleting the users that are written by the incremental
  // pull_requests stream.
  get supportsIncremental(): boolean {
    return true;
  }

  // Not used, but necessary to pass Airbyte UI validation check
  get cursorField(): string | string[] {
    return 'url';
  }

  async *readRecords(): AsyncGenerator<User> {
    const azureRepo = await AzureRepos.make(this.config, this.logger);
    yield* azureRepo.getUsers();
  }
}
