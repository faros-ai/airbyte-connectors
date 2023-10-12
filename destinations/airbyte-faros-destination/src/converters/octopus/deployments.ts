import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import GitUrlParse from 'git-url-parse';

import {Common} from '../common/common';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {OctopusConverter} from './common';

export class Deployments extends OctopusConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Deployment',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];
    const source = this.streamName.source;
    const deployment = record.record.data;

    const deploymentKey = {
      uid: deployment.Id,
      source,
    };

    res.push({
      model: 'cicd_Deployment',
      record: {
        ...deploymentKey,
        application: Common.computeApplication(deployment.ProjectName),
        url: deployment.Links?.Self,
        requestedAt: Utils.toDate(deployment.Task?.QueueTime),
        startedAt: Utils.toDate(deployment.Task?.StartTime),
        endedAt: Utils.toDate(deployment.Task?.CompletedTime),
        env: this.convertOctopusEnvironment(deployment.EnvironmentName),
        status: this.convertOctopusStatus(
          deployment.Task?.State,
          deployment.Task?.ErrorMessage
        ),
      },
    });

    const buildInformation = deployment.Release.BuildInformation;
    if (buildInformation?.length) {
      for (const buildInfo of buildInformation) {
        const parsedVcsInfo = GitUrlParse(buildInfo.VcsRoot);

        const commitKey = {
          sha: buildInfo.VcsCommitNumber,
          repository: {
            name: parsedVcsInfo.name.toLowerCase(),
            organization: {
              uid: parsedVcsInfo.owner.toLowerCase(),
              source: this.vcsSource(ctx),
            },
          },
        };

        // TODO: does this make sense?
        const artifactKey = {
          uid: `${buildInfo.PackageId}:${buildInfo.Version}`,
          repo: {
            uid: deployment.ProjectName,
            organization: {
              uid: commitKey.repository.organization.uid,
              source: 'Octopus',
            },
          },
        };

        res.push({
          model: 'cicd_Artifact',
          record: artifactKey,
        });
        res.push({
          model: 'cicd_ArtifactDeployment',
          record: {
            artifact: artifactKey,
            deployment: deploymentKey,
          },
        });
        res.push({
          model: 'cicd_ArtifactCommitAssociation',
          record: {
            artifact: artifactKey,
            commit: commitKey,
          },
        });
      }
    }

    return res;
  }

  /**
   * Octopus task statuses include:
   * Canceled, Cancelling, Executing, Failed, Queued, Success, TimedOut
   */
  private convertOctopusStatus(
    octopusStatus: string | undefined,
    octopusErrMsg: string | undefined
  ): {
    category: string;
    detail: string;
  } {
    if (!octopusStatus) {
      return {category: 'Custom', detail: 'undefined'};
    }
    const status = octopusStatus.toLowerCase();
    const detail = `${octopusStatus}${
      octopusErrMsg ? ' - ' + octopusErrMsg : ''
    }`;

    switch (status) {
      case 'canceled':
      case 'cancelling':
        return {category: 'Canceled', detail};
      case 'executing':
        return {category: 'Running', detail};
      case 'failed':
        return {category: 'Failed', detail};
      case 'success':
        return {category: 'Success', detail};
      case 'queued':
        return {category: 'Queued', detail};
      default:
        return {category: 'Custom', detail};
    }
  }

  private convertOctopusEnvironment(octopusEnv: string | undefined): {
    category: string;
    detail: string;
  } {
    if (!octopusEnv) {
      return {category: 'Custom', detail: 'undefined'};
    }
    const env = octopusEnv.toLowerCase();
    const detail = octopusEnv;

    switch (env) {
      case 'production':
      case 'prod':
        return {category: 'Prod', detail};
      case 'staging':
        return {category: 'Staging', detail};
      case 'qa':
        return {category: 'QA', detail};
      case 'development':
      case 'develop':
      case 'dev':
        return {category: 'Dev', detail};
      case 'sandbox':
        return {category: 'Sandbox', detail};
      case 'canary':
        return {category: 'Canary', detail};
      default:
        return {category: 'Custom', detail};
    }
  }
}
