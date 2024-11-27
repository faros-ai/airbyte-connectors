import {SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {AzureWorkitems} from '../azure-workitems';
import {Iteration} from '../models';
import {ProjectStreamSlice, StreamWithProjectSlices} from './common';

export class Iterations extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/iterations.json');
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectStreamSlice
  ): AsyncGenerator<Iteration> {
    const azureWorkitem = await AzureWorkitems.instance(
      this.config,
      this.logger
    );
    const projectId = streamSlice?.id;
    yield* azureWorkitem.getIterations(projectId);
  }
}
