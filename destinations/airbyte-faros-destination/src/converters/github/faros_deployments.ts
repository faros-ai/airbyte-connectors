import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Deployment} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord} from '../converter';
import {CategoryRef, GitHubCommon, GitHubConverter} from './common';

export class FarosDeployments extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Artifact',
    'cicd_ArtifactCommitAssociation',
    'cicd_ArtifactDeployment',
    'cicd_Deployment',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const deployment = record.record.data as Deployment;
    const res: DestinationRecord[] = [];

    const repoKey = GitHubCommon.repoKey(
      deployment.org,
      deployment.repo,
      source
    );

    const deploymentStatus = this.mapDeploymentStatus(
      deployment.latestStatus?.state || deployment.state
    );
    const environment = this.mapEnvironment(deployment.environment);
    const isTerminalState = this.isTerminalState(
      deployment.latestStatus?.state || deployment.state
    );

    const application = {
      name: `${repoKey.organization.uid}/${repoKey.name}`,
      platform: source,
    };

    res.push({
      model: 'cicd_Deployment',
      record: {
        uid: `${deployment.databaseId}`,
        application,
        requestedAt: Utils.toDate(deployment.createdAt),
        startedAt: Utils.toDate(deployment.createdAt),
        endedAt: isTerminalState ? Utils.toDate(deployment.updatedAt) : null,
        env: environment,
        status: deploymentStatus,
        source,
      },
    });

    // Create dummy artifact to link deployment to commit
    if (deployment.commitOid) {
      const artifactUid = deployment.commitOid;
      const cicdRepository = {
        uid: repoKey.uid,
        name: repoKey.name,
        organization: repoKey.organization,
      };

      // Create dummy artifact
      res.push({
        model: 'cicd_Artifact',
        record: {
          uid: artifactUid,
          repository: cicdRepository,
          createdAt: Utils.toDate(deployment.createdAt),
        },
      });

      // Link artifact to commit
      res.push({
        model: 'cicd_ArtifactCommitAssociation',
        record: {
          artifact: {
            uid: artifactUid,
            repository: cicdRepository,
          },
          commit: {
            repository: {
              uid: repoKey.uid,
              name: repoKey.name,
              organization: repoKey.organization,
            },
            sha: deployment.commitOid,
            uid: deployment.commitOid,
          },
        },
      });

      // Link artifact to deployment
      res.push({
        model: 'cicd_ArtifactDeployment',
        record: {
          artifact: {
            uid: artifactUid,
            repository: cicdRepository,
          },
          deployment: {
            uid: `${deployment.databaseId}`,
          },
        },
      });
    }

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
