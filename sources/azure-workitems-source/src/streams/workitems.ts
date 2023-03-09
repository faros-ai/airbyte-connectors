import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {AzureWorkitems, AzureWorkitemsConfig} from '../azure-workitems';
import {WorkItem} from '../models';

export class Workitems extends AirbyteStreamBase {
  constructor(
    private readonly config: AzureWorkitemsConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/workitems.json');
  }
  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(): AsyncGenerator<WorkItem> {
    const azureWorkitem = await AzureWorkitems.instance(this.config);
    yield* azureWorkitem.getWorkitems();
  }
}
