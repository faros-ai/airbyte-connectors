import {AirbyteRecord} from 'faros-airbyte-cdk';
import {FarosDeploymentOutput} from 'faros-airbyte-common/gitlab';
import {Utils} from 'faros-js-client';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {CategoryRef, GitlabConverter} from './common';

export class FarosDeployments extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Build',
    'cicd_BuildCommitAssociation',
    'cicd_Deployment',
    'cicd_Artifact',
    'cicd_ArtifactCommitAssociation',
    'cicd_ArtifactDeployment',
  ];

  async convert(
    record: AirbyteRecord,
    ctx?: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const deployment = record.record.data as FarosDeploymentOutput;
    const res: DestinationRecord[] = [];

    const cicdOrganization = {uid: toLower(deployment.group_id), source};
    const cicdPipeline = {
      organization: cicdOrganization,
      uid: toLower(deployment.project_path),
    };
    const cicdRepository = {
      uid: toLower(deployment.project_path),
      organization: cicdOrganization,
    };

    const vcsOrganization = {uid: toLower(deployment.group_id), source};
    const vcsRepository = {
      name: toLower(deployment.project_path),
      uid: toLower(deployment.project_path),
      organization: vcsOrganization,
    };

    const application = {name: deployment.project_path, platform: source};

    if (deployment.deployable) {
      const buildStatus = this.mapBuildStatus(deployment.deployable.status);

      res.push({
        model: 'cicd_Build',
        record: {
          uid: `${deployment.deployable.id}`,
          name: deployment.deployable.name,
          number: deployment.deployable.id,
          pipeline: cicdPipeline,
          status: buildStatus,
          url: deployment.deployable.web_url,
          createdAt: Utils.toDate(deployment.deployable.created_at),
          startedAt: Utils.toDate(deployment.deployable.started_at),
          endedAt: Utils.toDate(deployment.deployable.finished_at),
        },
      });

      if (deployment.sha) {
        res.push({
          model: 'cicd_BuildCommitAssociation',
          record: {
            build: {uid: `${deployment.deployable.id}`, pipeline: cicdPipeline},
            commit: {
              repository: vcsRepository,
              sha: deployment.sha,
              uid: deployment.sha,
            },
          },
        });
      }
    }

    const deploymentStatus = this.mapDeploymentStatus(deployment.status);
    const environment = this.mapEnvironment(deployment.environment?.name);

    res.push({
      model: 'cicd_Deployment',
      record: {
        uid: `${deployment.id}`,
        application,
        url: deployment.deployable?.web_url ?? null,
        build: deployment.deployable
          ? {
              uid: `${deployment.deployable.id}`,
              pipeline: cicdPipeline,
            }
          : null,
        requestedAt: Utils.toDate(deployment.created_at),
        startedAt: Utils.toDate(
          deployment.deployable?.started_at ?? deployment.created_at
        ),
        endedAt: Utils.toDate(deployment.deployable?.finished_at),
        env: environment,
        status: deploymentStatus,
        source,
      },
    });

    if (
      deployment.deployable?.artifacts &&
      Array.isArray(deployment.deployable.artifacts)
    ) {
      for (const artifact of deployment.deployable.artifacts as any[]) {
        const artifactUid = `${deployment.deployable.id}-${artifact.filename}`;

        res.push({
          model: 'cicd_Artifact',
          record: {
            uid: artifactUid,
            repository: cicdRepository,
            name: artifact.filename,
            type: artifact.file_type,
            createdAt: Utils.toDate(
              deployment.deployable.finished_at ?? deployment.created_at
            ),
          },
        });

        if (deployment.sha) {
          res.push({
            model: 'cicd_ArtifactCommitAssociation',
            record: {
              artifact: {uid: artifactUid, source},
              commit: {
                repository: vcsRepository,
                sha: deployment.sha,
                uid: deployment.sha,
              },
            },
          });
        }

        res.push({
          model: 'cicd_ArtifactDeployment',
          record: {
            artifact: {uid: artifactUid, source},
            deployment: {uid: `${deployment.id}`, source},
          },
        });
      }
    }

    return res;
  }

  private mapDeploymentStatus(status: string): CategoryRef {
    if (!status) {
      return {category: 'Custom', detail: 'undefined'};
    }

    switch (toLower(status)) {
      case 'running':
        return {category: 'Running', detail: status};
      case 'success':
        return {category: 'Success', detail: status};
      case 'failed':
        return {category: 'Failed', detail: status};
      case 'canceled':
        return {category: 'Canceled', detail: status};
      case 'created':
      case 'blocked':
        return {category: 'Queued', detail: status};
      default:
        return {category: 'Custom', detail: status};
    }
  }

  private mapEnvironment(environmentName: string): CategoryRef {
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
    } else if (lowerName.includes('dev') || lowerName.includes('development')) {
      return {category: 'Dev', detail: environmentName};
    } else if (lowerName.includes('sandbox')) {
      return {category: 'Sandbox', detail: environmentName};
    } else if (lowerName.includes('canary')) {
      return {category: 'Canary', detail: environmentName};
    } else {
      return {category: 'Custom', detail: environmentName};
    }
  }

  private mapBuildStatus(status: string): CategoryRef {
    if (!status) {
      return {category: 'Unknown', detail: 'undefined'};
    }

    const detail = toLower(status);
    switch (detail) {
      case 'canceled':
        return {category: 'Canceled', detail};
      case 'failed':
        return {category: 'Failed', detail};
      case 'running':
        return {category: 'Running', detail};
      case 'success':
        return {category: 'Success', detail};
      case 'created':
      case 'manual':
      case 'pending':
      case 'preparing':
      case 'scheduled':
      case 'waiting_for_resource':
        return {category: 'Queued', detail};
      case 'skipped':
      default:
        return {category: 'Unknown', detail};
    }
  }
}
