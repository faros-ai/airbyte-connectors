import {StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {AzureWorkitems} from '../azure-workitems';
import {WorkItem} from '../models';
import {StreamWithProjectSlices} from './common';

export class Workitems extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/workitems.json');
  }

  async *readRecords(): AsyncGenerator<WorkItem> {
    const azureWorkitem = await AzureWorkitems.instance(
      this.config,
      this.logger
    );
    yield* azureWorkitem.getWorkitems();
  }
}
