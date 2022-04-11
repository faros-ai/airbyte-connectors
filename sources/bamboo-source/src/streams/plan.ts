import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Bamboo, BambooConfig} from '../bamboo';
import {Plan} from '../models';

export class Plans extends AirbyteStreamBase {
  constructor(
    private readonly config: BambooConfig,
    protected readonly logger: AirbyteLogger,
    protected readonly projectNames?: [string]
  ) {
    super(logger);
  }
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/plans.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }
  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: Dictionary<any>
  ): AsyncGenerator<Plan, any, unknown> {
    const bamboo = await Bamboo.instance(this.config, this.logger);
    yield* bamboo.getPlans(this.projectNames);
  }
}
