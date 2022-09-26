import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {User} from '../models';
import {Squadcast, SquadcastConfig} from '../squadcast';

export class Users extends AirbyteStreamBase {
  constructor(
    private readonly config: SquadcastConfig,
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
    const squadcast = await Squadcast.instance(this.config, this.logger);
    yield* squadcast.getUsers();
  }
}
