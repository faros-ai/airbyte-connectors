import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';
import {Dictionary} from 'ts-essentials';

import {Bamboo, BambooConfig} from '../bamboo';
import {Build, Deployment} from '../models';

interface BuildState {
  lastDeploymentStartedDate: string;
}

export class Deployments extends AirbyteStreamBase {
  constructor(
    private readonly config: BambooConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/deployments.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  get cursorField(): string | string[] {
    return 'startedDate';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: BuildState
  ): AsyncGenerator<Deployment, any, unknown> {
    const lastDeploymentStartedDate =
      syncMode === SyncMode.INCREMENTAL
        ? Utils.toDate(streamState?.lastDeploymentStartedDate)
        : undefined;
    const bamboo = await Bamboo.instance(this.config, this.logger);
    yield* bamboo.getDeployments(lastDeploymentStartedDate);
  }
}
