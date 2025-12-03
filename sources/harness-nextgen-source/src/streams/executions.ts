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

  private toDeploymentStatus(status: string): {category: string; detail: string} {
    const s = status?.toLowerCase() ?? '';
    const canceled = ['aborted', 'rejected', 'abortedbyfreeze'];
    const failed = ['error', 'expired', 'failed', 'errored', 'approvalrejected'];
    const queued = ['paused', 'queued', 'waiting', 'resourcewaiting', 'asyncwaiting', 'taskwaiting', 'timedwaiting', 'interventionwaiting', 'approvalwaiting', 'inputwaiting'];
    const running = ['running', 'notstarted'];
    const success = ['success', 'succeeded', 'ignorefailed'];
    if (canceled.includes(s)) return {category: 'Canceled', detail: status};
    if (failed.includes(s)) return {category: 'Failed', detail: status};
    if (queued.includes(s)) return {category: 'Queued', detail: status};
    if (running.includes(s)) return {category: 'Running', detail: status};
    if (success.includes(s)) return {category: 'Success', detail: status};
    return {category: 'Custom', detail: status};
  }
}
