import {ProjectReference} from 'azure-devops-node-api/interfaces/ReleaseInterfaces';
import {SyncMode} from 'faros-airbyte-cdk';
import {WorkItemWithRevisions} from 'faros-airbyte-common/azure-devops';
import {Dictionary} from 'ts-essentials';

import {AzureWorkitems} from '../azure-workitems';
import {StreamWithProjectSlices} from './common';

export class Workitems extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/workitems.json');
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectReference
  ): AsyncGenerator<WorkItemWithRevisions> {
    const azureWorkitem = await AzureWorkitems.instance(
      this.config,
      this.logger
    );

    const {name, id} = streamSlice;
    yield* azureWorkitem.getWorkitems(name, id);
  }
}
