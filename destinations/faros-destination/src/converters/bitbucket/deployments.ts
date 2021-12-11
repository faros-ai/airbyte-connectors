import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {BitbucketConverter, CategoryRef} from './common';
import {Commit, Deployment, DeploymentsState} from './types';

enum EnvironmentCategory {
  PROD = 'Prod',
  STAGING = 'Staging',
  QA = 'QA',
  DEV = 'Dev',
  SANDBOX = 'Sandbox',
  CUSTOM = 'Custom',
}

enum DeploymentStatusCategory {
  CANCELED = 'Canceled',
  CUSTOM = 'Custom',
  FAILED = 'Failed',
  QUEUED = 'Queued',
  RUNNING = 'Running',
  ROLLED_BACK = 'RolledBack',
  SUCCESS = 'Success',
}

export class BitbucketDeployments extends BitbucketConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Deployment',
  ];

  private readonly commitsStream = new StreamName('bitbucket', 'commits');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [this.commitsStream];
  }

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const deployment = record.record.data as Deployment;

    const applicationMapping = this.applicationMapping(ctx);
    const application = applicationMapping[deployment.deployable?.name] ?? null;

    const commitsStream = this.commitsStream.asString;
    const commitRecord = ctx.get(
      commitsStream,
      deployment.deployable?.commit?.hash
    );
    const commit = commitRecord?.record?.data as undefined | Commit;

    const [workspace, repo] = commit?.repository?.fullName?.split('/');
    let build = null;
    if (workspace && repo) {
      const orgKey = {uid: workspace?.toLowerCase(), source};
      const pipelineKey = {organization: orgKey, uid: repo?.toLowerCase()};
      build = {
        pipeline: pipelineKey,
        uid: deployment.deployable?.pipeline?.uuid,
      };
    }

    return [
      {
        model: 'cicd_Deployment',
        record: {
          application,
          build,
          uid: deployment.uuid,
          env: this.convertEnvironment(deployment.environment?.slug),
          status: this.convertDeploymentStatus(deployment.state),
          startedAt: Utils.toDate(deployment.deployable.createdOn),
          source,
        },
      },
    ];
  }

  private convertEnvironment(env?: string): CategoryRef {
    if (!env) {
      return {category: 'Unknown', detail: 'undefined'};
    }

    const detail = env?.toLowerCase();
    switch (detail) {
      case 'test':
        return {category: EnvironmentCategory.QA, detail};
      case 'staging':
        return {category: EnvironmentCategory.STAGING, detail};
      case 'production':
        return {category: EnvironmentCategory.PROD, detail};
      default:
        return {category: EnvironmentCategory.CUSTOM, detail};
    }
  }

  private convertDeploymentStatus(state?: DeploymentsState): CategoryRef {
    if (!state) {
      return {category: 'Unknown', detail: 'undefined'};
    }

    const detail = (state.status?.name || state.name).toLowerCase();
    switch (detail) {
      case 'failed':
        return {category: DeploymentStatusCategory.FAILED, detail};
      case 'completed':
      case 'successful':
        return {category: DeploymentStatusCategory.SUCCESS, detail};
      default:
        return {category: DeploymentStatusCategory.CUSTOM, detail};
    }
  }
}
