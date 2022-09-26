import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Okta, OktaConfig} from '../okta';

export class Users extends AirbyteStreamBase {
  constructor(
    private readonly config: OktaConfig,
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
  get cursorField(): string | string[] {
    return 'lastUpdated';
  }

  async *readRecords(): AsyncGenerator<Dictionary<any, string>, any, unknown> {
    // TODO: add support for incremental sync
    const okta = await Okta.instance(this.config, this.logger);
    yield* okta.getUsers();
  }
}
