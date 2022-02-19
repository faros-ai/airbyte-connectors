import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Application, Spinnaker, SpinnakerConfig} from '../spinnaker';

export class Applications extends AirbyteStreamBase {
  constructor(
    private readonly config: SpinnakerConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/applications.json');
  }
  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: Dictionary<any>
  ): AsyncGenerator<Application> {
    const spinnaker = Spinnaker.instance(this.config, this.logger);

    yield* spinnaker.getApplications();
  }
}
