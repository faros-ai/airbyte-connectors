import {ProjectReference} from 'azure-devops-node-api/interfaces/ReleaseInterfaces';
import {WorkItemClassificationNode} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import {SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {AzureWorkitems} from '../azure-workitems';
import {StreamWithProjectSlices} from './common';

export class Iterations extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/iterations.json');
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectReference
  ): AsyncGenerator<WorkItemClassificationNode> {
    const azureWorkitem = await AzureWorkitems.instance(
      this.config,
      this.logger,
      this.config.additional_fields,
      this.config.fetch_work_item_comments
    );
    const projectId = streamSlice?.id;
    yield* azureWorkitem.getIterations(projectId);
  }
}
