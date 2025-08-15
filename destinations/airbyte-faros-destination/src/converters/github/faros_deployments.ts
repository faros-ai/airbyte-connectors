import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Deployment} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord} from '../converter';
import {CategoryRef, GitHubConverter} from './common';

export class FarosDeployments extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Deployment',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const deployment = record.record.data as Deployment;
    const res: DestinationRecord[] = [];

    const deploymentStatus = this.mapDeploymentStatus(
      deployment.latestStatus?.state || deployment.state
    );
    const environment = this.mapEnvironment(deployment.environment);
    const isTerminalState = this.isTerminalState(
      deployment.latestStatus?.state || deployment.state
    );

    res.push({
      model: 'cicd_Deployment',
      record: {
        uid: `${deployment.databaseId}`,
        requestedAt: Utils.toDate(deployment.createdAt),
        startedAt: Utils.toDate(deployment.createdAt),
        endedAt: isTerminalState ? Utils.toDate(deployment.updatedAt) : null,
        env: environment,
        status: deploymentStatus,
        source,
      },
    });

    return res;
  }

  private isTerminalState(state?: string): boolean {
    if (!state) {
      return false;
    }

    const lowerState = toLower(state);
    return ['success', 'failure', 'error', 'inactive'].includes(lowerState);
  }

  private mapDeploymentStatus(state?: string): CategoryRef {
    if (!state) {
      return {category: 'Custom', detail: 'pending'};
    }

    const lowerState = toLower(state);

    switch (lowerState) {
      case 'success':
        return {category: 'Success', detail: lowerState};
      case 'failure':
      case 'error':
        return {category: 'Failed', detail: lowerState};
      case 'in_progress':
      case 'pending':
        return {category: 'Running', detail: lowerState};
      case 'queued':
        return {category: 'Queued', detail: lowerState};
      case 'inactive':
        return {category: 'Canceled', detail: lowerState};
      default:
        return {category: 'Custom', detail: lowerState};
    }
  }

  private mapEnvironment(environmentName?: string): CategoryRef {
    if (!environmentName) {
      return {category: 'Custom', detail: 'unknown'};
    }

    const lowerName = toLower(environmentName);

    if (lowerName.includes('prod')) {
      return {category: 'Prod', detail: environmentName};
    } else if (lowerName.includes('staging') || lowerName.includes('stage')) {
      return {category: 'Staging', detail: environmentName};
    } else if (lowerName.includes('qa') || lowerName.includes('test')) {
      return {category: 'QA', detail: environmentName};
    } else if (lowerName.includes('dev')) {
      return {category: 'Dev', detail: environmentName};
    } else if (lowerName.includes('sandbox')) {
      return {category: 'Sandbox', detail: environmentName};
    } else if (lowerName.includes('canary')) {
      return {category: 'Canary', detail: environmentName};
    } else {
      return {category: 'Custom', detail: environmentName};
    }
  }
}
