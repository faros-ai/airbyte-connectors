import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {User} from '../opsgenie/models';
import {OpsGenie, OpsGenieConfig} from '../opsgenie/opsgenie';
export class Users extends AirbyteStreamBase {
  constructor(
    private readonly config: OpsGenieConfig,
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
  async *readRecords(): AsyncGenerator<User> {
    const opsGenie = OpsGenie.instance(this.config, this.logger);
    yield* opsGenie.getUsers();
  }
}
