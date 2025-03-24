import {ProjectReference} from 'azure-devops-node-api/interfaces/ReleaseInterfaces';
import {SyncMode} from 'faros-airbyte-cdk';
import {Pipeline} from 'faros-airbyte-common/azure-devops';
import {Dictionary} from 'ts-essentials';

import {AzurePipelines} from '../azurepipeline';
import {AzurePipelinesStreamBase} from './common';
export class Pipelines extends AzurePipelinesStreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/pipelines.json');
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectReference
  ): AsyncGenerator<Pipeline> {
    const azurePipeline = await AzurePipelines.instance(
      this.config,
      this.logger
    );
    yield* azurePipeline.getPipelines(streamSlice);
  }
}
