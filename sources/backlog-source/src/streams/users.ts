import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Backlog, BacklogConfig} from '../backlog';
import {User} from '../models';

export class Users extends AirbyteStreamBase {
  constructor(
    private readonly config: BacklogConfig,
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

  async *readRecords(): AsyncGenerator<User, any, unknown> {
    const backlog = await Backlog.instance(this.config, this.logger);
    yield* backlog.getUsers();
  }
}
