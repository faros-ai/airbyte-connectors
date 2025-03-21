import {SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {AzureWorkitems} from '../azure-workitems';
import {WorkItemWithRevisions} from '../models';
import {ProjectStreamSlice, StreamWithProjectSlices} from './common';

export class Workitems extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/workitems.json');
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectStreamSlice
  ): AsyncGenerator<WorkItemWithRevisions> {
    const azureWorkitem = await AzureWorkitems.instance(
      this.config,
      this.logger
    );
    const {name, id} = streamSlice;
    yield* azureWorkitem.getWorkitems(name, id);
  }
}
