import {json} from 'stream/consumers';
import {Dictionary} from 'ts-essentials';

import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
} from '../../../../faros-airbyte-cdk/lib';
import {AzureWorkitems, AzureWorkitemsConfig} from '../azure-workitems';
import {CustomWorkItem, WorkItem, WorkItem1, WorkItemTest} from '../models';

export class Workitems extends AirbyteStreamBase {
  constructor(
    private readonly config: AzureWorkitemsConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    const jsonSchema = require('../../resources/schemas/workitems.json');
    return jsonSchema;
  }
  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(): AsyncGenerator<CustomWorkItem> {
    const azureWorkitem = await AzureWorkitems.instance(
      this.config,
      this.logger
    );
    yield* azureWorkitem.getWorkitems();
  }
}
