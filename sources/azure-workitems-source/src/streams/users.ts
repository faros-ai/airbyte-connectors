import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {AzureWorkitems} from '../azure-workitems';
import {AzureWorkitemsConfig, User} from '../models';

export class Users extends AirbyteStreamBase {
  constructor(
    private readonly config: AzureWorkitemsConfig,
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
    const azureWorkitem = await AzureWorkitems.instance(
      this.config,
      this.logger
    );
    yield* azureWorkitem.getUsers(this.config.projects);
  }
}
