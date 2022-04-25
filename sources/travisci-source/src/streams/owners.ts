import {AxiosInstance} from 'axios';
import {AirbyteLogger, AirbyteStreamBase, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {TravisCI, TravisCIConfig} from '../travisci/travisci';
import {Owner} from '../travisci/typings';

export class Owners extends AirbyteStreamBase {
  constructor(
    logger: AirbyteLogger,
    private readonly config: TravisCIConfig,
    private readonly axios?: AxiosInstance
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/owners.json');
  }

  get primaryKey(): string {
    return 'id';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any, string>,
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<Owner, any, unknown> {
    const travisCI = TravisCI.instance(this.config, this.axios);
    yield* travisCI.fetchOwner();
  }
}
