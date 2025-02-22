import {SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {AzureWorkitems} from '../azure-workitems';
import {ProjectStreamSlice, StreamWithProjectSlices} from './common';
import {WorkItemClassificationNode} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';

export class Iterations extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/iterations.json');
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectStreamSlice
  ): AsyncGenerator<WorkItemClassificationNode> {
    const azureWorkitem = await AzureWorkitems.instance(
      this.config,
      this.logger
    );
    const projectId = streamSlice?.id;
    yield* azureWorkitem.getIterations(projectId);
  }
}
