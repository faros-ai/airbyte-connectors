import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Execution, Spinnaker, SpinnakerConfig} from '../spinnaker';

interface StreamSlice {
  pipelineConfigId: string;
}

export class Executions extends AirbyteStreamBase {
  constructor(
    private readonly config: SpinnakerConfig,
    private readonly pipelineConfigIds: string[],
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/executions.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: Dictionary<any>
  ): AsyncGenerator<Execution> {
    const spinnaker = Spinnaker.instance(this.config, this.logger);
    const pipelineConfigIDs = this.pipelineConfigIds.join(',');

    yield* spinnaker.getExecutions(pipelineConfigIDs);
  }
}
