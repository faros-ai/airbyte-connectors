import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {AzurePipeline, AzurePipelineConfig} from '../azurepipeline';
import {Pipeline} from '../models';

export class Pipelines extends AirbyteStreamBase {
  constructor(
    private readonly config: AzurePipelineConfig,
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

  async *readRecords(): AsyncGenerator<Pipeline> {
    const azurePipeline = AzurePipeline.instance(this.config);
    yield* azurePipeline.getPipelines();
  }
}
