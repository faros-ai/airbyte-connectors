import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {DateTime} from 'luxon';
import {Dictionary} from 'ts-essentials';

import {DEFAULT_CUTOFF_DAYS, Harness} from '../harness';
import {ExecutionNode, ExecutionState, HarnessConfig} from '../harness_models';

const DEFAULT_DEPLOYMENT_TIMEOUT = 24;

export class Executions extends AirbyteStreamBase {
  constructor(
    private readonly config: HarnessConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/executions.json');
  }
  get primaryKey(): StreamKey {
    return 'id';
  }
  get cursorField(): string | string[] {
    return 'endedAt';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ExecutionNode,
    streamState?: ExecutionState
  ): AsyncGenerator<ExecutionNode> {
    const harness = Harness.instance(this.config, this.logger);

    let since: number = null;
    if (syncMode === SyncMode.INCREMENTAL) {
      const lastEndedAt = streamState?.lastEndedAt;
      const defaultCutoffDate: number = DateTime.now()
        .minus({days: this.config.cutoff_days || DEFAULT_CUTOFF_DAYS})
        .toMillis();
      /** If we have already synced this execution, ignore cutoffDays
        and get everything since last sync to avoid gaps in data. Instead
        of sync execution from cutoff days*/
      since = lastEndedAt ? lastEndedAt : defaultCutoffDate;
    }

    yield* harness.getExecutions(since);
  }

  getUpdatedState(
    currentStreamState: ExecutionState,
    latestRecord: ExecutionNode
  ): ExecutionState {
    console.log({});

    const deploymentStatus = this.toDeploymentStatus(latestRecord.status);
    const isRunning = ['Running', 'Queued'].includes(deploymentStatus.category);
    const lastEndedAt = currentStreamState?.lastEndedAt ?? 0;
    const startedAt = latestRecord?.startedAt ?? 0;

    if (startedAt && isRunning) {
      const startedAtDate = DateTime.fromMillis(startedAt);
      const diffHours = DateTime.now().diff(startedAtDate, 'hours').hours;
      const timeout =
        this.config.deploymentTimeout ?? DEFAULT_DEPLOYMENT_TIMEOUT;

      if (diffHours >= 0 && diffHours <= timeout) {
        if (!lastEndedAt || lastEndedAt > startedAt) {
          return {lastEndedAt: startedAt};
        }
      }
    }

    return {
      lastEndedAt: Math.max(lastEndedAt, latestRecord.endedAt),
    };
  }

  private toDeploymentStatus(status: string): {
    category: string;
    detail: string;
  } {
    const statusLower = status.toLowerCase();

    switch (statusLower) {
      case 'aborted':
      case 'rejected':
        return {category: 'Canceled', detail: status};
      case 'error':
      case 'expired':
      case 'failed':
        return {category: 'Failed', detail: status};
      case 'paused':
      case 'queued':
      case 'waiting':
        return {category: 'Queued', detail: status};
      case 'resumed':
      case 'running':
        return {category: 'Running', detail: status};
      case 'success':
        return {category: 'Success', detail: status};
      case 'skipped':
      default:
        return {category: 'Custom', detail: status};
    }
  }
}
