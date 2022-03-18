import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {AzureGit, AzureGitConfig} from '../azuregit';
import {User} from '../models';

export class Users extends AirbyteStreamBase {
  constructor(
    private readonly config: AzureGitConfig,
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

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>
  ): AsyncGenerator<User> {
    const azureGit = await AzureGit.instance(this.config);
    yield* azureGit.getUsers();
  }
}
