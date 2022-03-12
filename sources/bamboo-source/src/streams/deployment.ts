import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';
import {Dictionary} from 'ts-essentials';

import {Bamboo, BambooConfig} from '../bamboo';
import {Deployment} from '../models';

interface DeploymentState {
  lastStartedDate: number;
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
    streamState?: DeploymentState
  ): AsyncGenerator<Deployment, any, unknown> {
    const lastStartedDate =
      syncMode === SyncMode.INCREMENTAL
        ? Utils.toDate(streamState?.lastStartedDate)
        : undefined;
    const bamboo = await Bamboo.instance(this.config, this.logger);
    yield* bamboo.getDeployments(lastStartedDate);
  }

  getUpdatedState(
    currentStreamState: DeploymentState,
    latestRecord: Deployment
  ): DeploymentState {
    const lastStartedDate: Date = new Date(latestRecord.startedDate);
    return {
      lastStartedDate:
        lastStartedDate >= new Date(currentStreamState?.lastStartedDate || 0)
          ? latestRecord.startedDate
          : currentStreamState.lastStartedDate,
    };
  }
}
