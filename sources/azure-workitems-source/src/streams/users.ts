import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {getUserIdentifier, User} from 'faros-airbyte-common/azure-devops';
import {Dictionary} from 'ts-essentials';

import {AzureWorkitems} from '../azure-workitems';
import {AzureWorkitemsConfig} from '../types';

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
    return 'id';
  }

  async *readRecords(): AsyncGenerator<User & {id: string}> {
    const azureWorkitem = await AzureWorkitems.instance(
      this.config,
      this.logger,
      this.config.additional_fields,
      this.config.fetch_work_item_comments
    );
    for await (const user of azureWorkitem.getUsers(this.config.projects)) {
      const id = getUserIdentifier(user);
      if (!id) {
        this.logger.warn(`Could not determine a unique ID for user object. Skipping.`);
        continue;
      }
      yield {
        ...user,
        id,
      };
    }
  }
}
