import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {FireHydrant, FireHydrantConfig} from '../firehydrant/firehydrant';
import {User} from '../firehydrant/models';
export class Users extends AirbyteStreamBase {
  constructor(
    private readonly config: FireHydrantConfig,
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
  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: Dictionary<any>
  ): AsyncGenerator<User> {
    const buildkite = FireHydrant.instance(this.config, this.logger);
    yield* buildkite.getUsers();
  }
}
