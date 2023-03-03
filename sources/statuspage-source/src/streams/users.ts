import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Statuspage, StatuspageConfig, User} from '../statuspage';

export class Users extends AirbyteStreamBase {
  constructor(
    private readonly config: StatuspageConfig,
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
    const statuspage = Statuspage.instance(this.config, this.logger);
    yield* statuspage.getUsers();
  }
}
