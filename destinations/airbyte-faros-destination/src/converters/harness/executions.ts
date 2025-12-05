import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {Common} from '../common/common';
import {DestinationModel, DestinationRecord} from '../converter';
import {CICDBuildKey, HarnessConverter, PipelineExecution} from './common';

export class Executions extends HarnessConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Build',
    'cicd_Deployment',
    'compute_Application',
  ];

  private seenApplications = new Set<string>();

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const execution = record.record.data as PipelineExecution;
    const res: DestinationRecord[] = [];

    const cdInfo = execution.moduleInfo?.cd;
    if (!cdInfo) {
      return res;
    }

    // Build key
    const build: CICDBuildKey = {
      uid: execution.planExecutionId,
      pipeline: {
        uid: execution.pipelineIdentifier,
        organization: {uid: execution.orgIdentifier, source},
      },
    };

    // Build (pipeline execution)
    res.push({
      model: 'cicd_Build',
      record: {
        ...build,
        name: execution.name,
        startedAt: Utils.toDate(execution.startTs),
        endedAt: Utils.toDate(execution.endTs),
        status: this.toBuildStatus(execution.status),
      },
    });

    // Application (from service)
    const serviceName = cdInfo.serviceIdentifiers?.[0];
    let application = null;
    if (serviceName) {
      application = Common.computeApplication(serviceName, '');
      const appKey = application.uid;
      if (!this.seenApplications.has(appKey)) {
        res.push({model: 'compute_Application', record: application});
        this.seenApplications.add(appKey);
      }
    }

    // Deployment
    const envName = cdInfo.envIdentifiers?.[0];
    const envType = cdInfo.environmentTypes?.[0];

    res.push({
      model: 'cicd_Deployment',
      record: {
        uid: execution.planExecutionId,
        source,
        application,
        build,
        startedAt: Utils.toDate(execution.startTs),
        endedAt: Utils.toDate(execution.endTs),
        env: this.toEnvironment(envName, envType),
        status: this.toDeploymentStatus(execution.status),
      },
    });

    return res;
  }

  private toBuildStatus(status: string): {category: string; detail: string} {
    const statusUpper = status?.toUpperCase();

    switch (statusUpper) {
      case 'ABORTED':
        return {category: 'Canceled', detail: status};
      case 'EXPIRED':
      case 'FAILED':
        return {category: 'Failed', detail: status};
      case 'QUEUED':
      case 'PAUSED':
      case 'WAITING':
      case 'APPROVALWAITING':
      case 'ASYNCWAITING':
      case 'TASKWAITING':
      case 'TIMEDWAITING':
        return {category: 'Queued', detail: status};
      case 'RUNNING':
        return {category: 'Running', detail: status};
      case 'SUCCESS':
        return {category: 'Success', detail: status};
      default:
        return {category: 'Custom', detail: status};
    }
  }

  private toDeploymentStatus(
    status: string
  ): {category: string; detail: string} {
    const statusUpper = status?.toUpperCase();

    switch (statusUpper) {
      case 'ABORTED':
        return {category: 'Canceled', detail: status};
      case 'EXPIRED':
      case 'FAILED':
        return {category: 'Failed', detail: status};
      case 'QUEUED':
      case 'PAUSED':
      case 'WAITING':
      case 'APPROVALWAITING':
      case 'ASYNCWAITING':
      case 'TASKWAITING':
      case 'TIMEDWAITING':
        return {category: 'Queued', detail: status};
      case 'RUNNING':
        return {category: 'Running', detail: status};
      case 'SUCCESS':
        return {category: 'Success', detail: status};
      default:
        return {category: 'Custom', detail: status};
    }
  }

  private toEnvironment(
    envName?: string,
    envType?: string
  ): {category: string; detail: string} {
    const env = envName || envType || 'unknown';
    const envLower = env.toLowerCase();

    if (envLower.includes('prod')) {
      return {category: 'Prod', detail: env};
    }
    if (envLower.includes('staging')) {
      return {category: 'Staging', detail: env};
    }
    if (envLower.includes('dev')) {
      return {category: 'Dev', detail: env};
    }
    if (envLower.includes('qa') || envLower.includes('test')) {
      return {category: 'QA', detail: env};
    }

    return {category: 'Custom', detail: env};
  }
}
