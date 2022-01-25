import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Application, Spinnaker, SpinnakerConfig} from '../spinnaker';

interface StreamSlice {
  buildMaster: string;
}

export class Jobs extends AirbyteStreamBase {
  constructor(
    private readonly config: SpinnakerConfig,
    private readonly buildMasters: string[],
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/jobs.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *streamSlices(
    syncMode: SyncMode,
    cursorField?: string[],
    streamState?: Dictionary<any>
  ): AsyncGenerator<StreamSlice> {
    for (const buildMaster of this.buildMasters) {
      yield {buildMaster};
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: Dictionary<any>
  ): AsyncGenerator<Application> {
    const spinnaker = Spinnaker.instance(this.config, this.logger);

    yield* spinnaker.getJobs(streamSlice.buildMaster);
  }
}
