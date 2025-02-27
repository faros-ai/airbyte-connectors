import {AirbyteLogger, AirbyteStreamBase} from 'faros-airbyte-cdk';
import {User} from 'faros-airbyte-common/wolken';
import {Dictionary} from 'ts-essentials';

import {Wolken, WolkenConfig} from '../wolken';

export class Users extends AirbyteStreamBase {
  constructor(
    private readonly config: WolkenConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  get dependencies(): ReadonlyArray<string> {
    return ['configuration_items'];
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/users.json');
  }

  get primaryKey(): string {
    return 'userPsNo';
  }

  async *readRecords(): AsyncGenerator<User> {
    const wolken = Wolken.instance(this.config, this.logger);
    yield* wolken.getUsers();
  }
}
