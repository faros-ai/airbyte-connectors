import {AxiosInstance} from 'axios';
import {AirbyteLogger, AirbyteStreamBase, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {TravisCI, TravisCIConfig} from '../travisci/travisci';
import {Repository} from '../travisci/typings';

export class Repositories extends AirbyteStreamBase {
  constructor(
    logger: AirbyteLogger,
    private readonly config: TravisCIConfig,
    private readonly axios?: AxiosInstance
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/repositories.json');
  }

  get primaryKey(): string {
    return 'id';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any, string>,
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<Repository, any, unknown> {
    const travisCI = TravisCI.instance(this.config, this.axios);
    yield* travisCI.fetchRepositories();
  }
}
