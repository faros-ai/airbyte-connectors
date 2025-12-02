import {SyncMode} from 'faros-airbyte-cdk';
import {DateTime} from 'luxon';

import {Execution, ExecutionState} from '../types';
import {ProjectSlice, StreamWithProjectSlices} from './common';

const DEFAULT_CUTOFF_DAYS = 90;
const DEFAULT_DEPLOYMENT_TIMEOUT = 24;

export class Executions extends StreamWithProjectSlices {
  getJsonSchema(): Record<string, any> {
    return require('../../resources/schemas/executions.json');
  }

  get primaryKey(): string {
    return 'planExecutionId';
  }

  get cursorField(): string[] {
    return ['endTs'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectSlice,
    streamState?: ExecutionState
  ): AsyncGenerator<Execution> {
    const harness = this.harness;

    let since: number = null;
    if (syncMode === SyncMode.INCREMENTAL) {
      const lastEndedAt = streamState?.lastEndedAt;
      const defaultCutoffDate: number = DateTime.now()
        .minus({days: this.config.cutoff_days || DEFAULT_CUTOFF_DAYS})
        .toMillis();
      since = lastEndedAt ? lastEndedAt : defaultCutoffDate;
    }

    yield* harness.getExecutions(
      streamSlice.orgIdentifier,
      streamSlice.projectIdentifier,
      since
    );
  }

  getUpdatedState(
    currentStreamState: ExecutionState,
    latestRecord: Execution
  ): ExecutionState {
    const lastEndedAt = currentStreamState?.lastEndedAt ?? 0;
    const deploymentStatus = this.toDeploymentStatus(latestRecord.status);
    const isRunning = ['Running', 'Queued'].includes(deploymentStatus.category);
    const startedAt = latestRecord?.startTs ?? 0;
    const endedAt = latestRecord?.endTs ?? 0;

    if (startedAt && isRunning) {
      const startedAtDate = DateTime.fromMillis(startedAt);
      const diffHours = DateTime.now().diff(startedAtDate, 'hours').hours;
      const timeout =
        this.config.deployment_timeout ?? DEFAULT_DEPLOYMENT_TIMEOUT;

      if (diffHours >= 0 && diffHours <= timeout) {
        if (!lastEndedAt || lastEndedAt > startedAt) {
          return {lastEndedAt: startedAt};
        }
      }
    }

    return {
      lastEndedAt: Math.max(lastEndedAt, endedAt),
    };
  }

  private toDeploymentStatus(status: string): {
    category: string;
    detail: string;
  } {
    const statusLower = status?.toLowerCase() ?? '';

    switch (statusLower) {
      case 'aborted':
      case 'rejected':
      case 'abortedbyfreeze':
        return {category: 'Canceled', detail: status};
      case 'error':
      case 'expired':
      case 'failed':
      case 'errored':
      case 'approvalrejected':
        return {category: 'Failed', detail: status};
      case 'paused':
      case 'queued':
      case 'waiting':
      case 'resourcewaiting':
      case 'asyncwaiting':
      case 'taskwaiting':
      case 'timedwaiting':
      case 'interventionwaiting':
      case 'approvalwaiting':
      case 'inputwaiting':
        return {category: 'Queued', detail: status};
      case 'running':
      case 'notstarted':
        return {category: 'Running', detail: status};
      case 'success':
      case 'succeeded':
      case 'ignorefailed':
        return {category: 'Success', detail: status};
      case 'skipped':
      case 'suspended':
      default:
        return {category: 'Custom', detail: status};
    }
  }
}
