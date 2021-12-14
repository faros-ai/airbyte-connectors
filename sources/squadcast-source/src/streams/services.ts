import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Service} from '../models';
import {Squadcast, SquadcastConfig} from '../squadcast';

export class Services extends AirbyteStreamBase {
  constructor(
    private readonly config: SquadcastConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/services.json');
  }
  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: Dictionary<any>
  ): AsyncGenerator<Service> {
    const squadcast = await Squadcast.instance(this.config, this.logger);
    yield* squadcast.getServices();
  }
}
