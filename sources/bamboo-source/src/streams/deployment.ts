import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {
  Bamboo,
  BambooConfig,
  DEFAULT_DEPLOYMENT_TIMEOUT,
  isNewer,
} from '../bamboo';
import {Deployment, DeploymentStatusCategory} from '../models';

interface DeploymentState {
  lastStartedDate?: number;
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
        ? new Date(streamState?.lastStartedDate)
        : undefined;
    const bamboo = await Bamboo.instance(this.config, this.logger);
    yield* bamboo.getDeployments(lastStartedDate);
  }

  getUpdatedState(
    currentStreamState: DeploymentState,
    latestRecord: Deployment
  ): DeploymentState {
    const lastStartedDate: number = currentStreamState.lastStartedDate;

    const startedDate = new Date(latestRecord.startedDate);
    const deploymentStatus = this.convertDeploymentStatus(
      latestRecord.deploymentState
    );
    const runningStartedDate = isNewer(
      deploymentStatus.category,
      [DeploymentStatusCategory.Running, DeploymentStatusCategory.Queued],
      this.config.deploymentTimeout ?? DEFAULT_DEPLOYMENT_TIMEOUT,
      new Date(lastStartedDate),
      startedDate
    );

    return {
      lastStartedDate:
        !lastStartedDate || runningStartedDate
          ? startedDate.getTime()
          : currentStreamState.lastStartedDate,
    };
  }

  convertDeploymentStatus(status: string | undefined): {
    category: DeploymentStatusCategory;
    detail: string;
  } {
    if (!status) {
      return {category: DeploymentStatusCategory.Custom, detail: 'undefined'};
    }
    const detail = status.toLowerCase();

    switch (detail) {
      case 'success':
        return {category: DeploymentStatusCategory.Success, detail};
      case 'failed':
        return {category: DeploymentStatusCategory.Failed, detail};
      case 'pending':
        return {category: DeploymentStatusCategory.Queued, detail};
      case 'in_progress':
        return {category: DeploymentStatusCategory.Running, detail};
      case 'cancelled':
        return {category: DeploymentStatusCategory.Canceled, detail};
      case 'rolled_back':
        return {category: DeploymentStatusCategory.RolledBack, detail};
      default:
        return {category: DeploymentStatusCategory.Custom, detail};
    }
  }
}
