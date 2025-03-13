import {TeamProject} from 'azure-devops-node-api/interfaces/CoreInterfaces';
import {SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {AzurePipelines} from '../azurepipeline';
import * as types from '../types';
import {AzurePipelinesStreamBase} from './common';
export class Pipelines extends AzurePipelinesStreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/pipelines.json');
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: TeamProject
  ): AsyncGenerator<types.Pipeline> {
    const azurePipeline = await AzurePipelines.instance(
      this.config,
      this.logger
    );
    yield* azurePipeline.getPipelines(streamSlice);
  }
}
