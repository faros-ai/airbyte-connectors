import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Application, Spinnaker, SpinnakerConfig} from '../spinnaker';

interface StreamSlice {
  application: string;
}

export class Pipelines extends AirbyteStreamBase {
  constructor(
    private readonly config: SpinnakerConfig,
    private readonly applications: string[],
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/pipelines.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *streamSlices(
    syncMode: SyncMode,
    cursorField?: string[],
    streamState?: Dictionary<any>
  ): AsyncGenerator<StreamSlice> {
    for (const application of this.applications) {
      yield {application};
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: Dictionary<any>
  ): AsyncGenerator<Application> {
    const spinnaker = Spinnaker.instance(this.config, this.logger);

    yield* spinnaker.getPipelines(streamSlice.application);
  }
}
