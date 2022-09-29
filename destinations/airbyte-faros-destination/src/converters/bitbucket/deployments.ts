import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {Common} from '../common/common';
import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {BitbucketConverter, CategoryRef} from './common';
import {Deployment, DeploymentsState, Pipeline} from './types';

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

export class Deployments extends BitbucketConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Deployment',
  ];

  private readonly pipelinesStream = new StreamName('bitbucket', 'pipelines');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [this.pipelinesStream];
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const deployment = record.record.data as Deployment;

    const applicationMapping = this.applicationMapping(ctx);
    let application = null;
    if (deployment.deployable?.name) {
      const mappedApp = applicationMapping[deployment.deployable?.name];
      application = Common.computeApplication(
        mappedApp?.name ?? deployment.deployable?.name,
        mappedApp?.platform
      );
    }
    const pipelinesStream = this.pipelinesStream.asString;

    const pipelineRecord = ctx.get(
      pipelinesStream,
      deployment.commit?.hash ||
        deployment.deployable?.commit?.hash ||
        deployment.release?.commit?.hash
    );

    const pipeline = pipelineRecord?.record?.data as undefined | Pipeline;
    const [workspace, repo] = (pipeline?.repository?.fullName || '').split('/');
    let build = null;
    if (workspace && repo) {
      const orgKey = {uid: workspace.toLowerCase(), source};
      const pipelineKey = {organization: orgKey, uid: repo.toLowerCase()};
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
          env: this.convertEnvironment(
            deployment.environment?.slug ?? deployment.fullEnvironment?.slug
          ),
          status: this.convertDeploymentStatus(deployment.state),
          startedAt: Utils.toDate(deployment.deployable.createdOn),
          source,
        },
      },
    ];
  }

  private convertEnvironment(env?: string): CategoryRef {
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
    const detail = (state.status?.name || state.name)?.toLowerCase();
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
