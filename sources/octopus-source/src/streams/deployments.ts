import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Deployment} from '../models';
import {Octopus, OctopusConfig} from '../octopus';

export class Deployments extends AirbyteStreamBase {
  constructor(
    private readonly config: OctopusConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/deployments.json');
  }
  get primaryKey(): StreamKey {
    return 'Id';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>
  ): AsyncGenerator<Deployment> {
    const octopus = await Octopus.instance(this.config, this.logger);
    yield* octopus.getDeployments();
  }
}
