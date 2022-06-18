import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Channel} from '../models';
import {Octopus, OctopusConfig} from '../octopus';

export class Channels extends AirbyteStreamBase {
  constructor(
    private readonly config: OctopusConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/channels.json');
  }
  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>
  ): AsyncGenerator<Channel> {
    const octopus = await Octopus.instance(this.config, this.logger);
    yield* octopus.getChannels();
  }
}
