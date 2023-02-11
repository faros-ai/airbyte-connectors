import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {Common} from '../common/common';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {
  CICDArtifact,
  CICDBuild,
  Execution,
  ExecutionImplementation,
  ExecutionPipeline,
  ExecutionWorkflow,
  HarnessConverter,
  HarnessExecutionNode,
} from './common';

const DEFAULT_CICD_ORGANIZATION_UID = 'default';
const DEFAULT_EXECUTION_TAG_APPLICATION_PLATFORM = 'faros_app_platform';
const DEFAULT_EXECUTION_TAG_ARTIFACT_ORG = 'faros_artifact_org';
const DEFAULT_EXECUTION_TAG_ARTIFACT_SOURCE = 'faros_artifact_source';
const DEFAULT_EXECUTION_TAG_ARTIFACT_REPO = 'faros_artifact_repo';

export class Executions extends HarnessConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_ArtifactDeployment',
    'cicd_Build',
    'cicd_Deployment',
    'compute_Application',
  ];

  private seenApplications = new Set<string>();

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const executionRaw = record.record.data;
    const source = this.streamName.source;
    const res: DestinationRecord[] = [];

    const execution = this.toExecution(
      executionRaw as HarnessExecutionNode,
      source
    );

    let application = null;
    if (execution?.application) {
      application = Common.computeApplication(
        execution.application?.name,
        execution.application?.platform
      );
      const appKey = application.uid;
      if (!this.seenApplications.has(appKey)) {
        res.push({model: 'compute_Application', record: application});
        this.seenApplications.add(appKey);
      }
    }

    const deploymentStatus = this.toDeploymentStatus(execution.status);
    const buildStatus = this.toBuildStatus(execution.status);
    const deployment = {uid: execution.uid, source};

    res.push({
      model: 'cicd_Deployment',
      record: {
        ...deployment,
        application,
        build: execution.build,
        startedAt: Utils.toDate(execution.startedAt),
        endedAt: Utils.toDate(execution.endedAt),
        env: this.toEnvironmentStatus(execution.env),
        status: deploymentStatus,
      },
    });

    if (execution.build) {
      res.push({
        model: 'cicd_Build',
        record: {
          ...execution.build,
          startedAt: Utils.toDate(execution.startedAt),
          endedAt: Utils.toDate(execution.endedAt),
          status: buildStatus,
        },
      });
    }

    if (execution.artifact) {
      res.push({
        model: 'cicd_ArtifactDeployment',
        record: {
          artifact: execution.artifact,
          deployment,
        },
      });
    }

    return res;
  }

  private parseArtifactFromTags(execution: HarnessExecutionNode): CICDArtifact {
    if (!execution.artifacts || !execution.artifacts.length) {
      return undefined;
    }

    const executionArtifact = execution.artifacts[0];

    // artifact repo organization pulled from application tags
    const organization = {
      uid: execution.application.tags.find(
        (t) => t.name === DEFAULT_EXECUTION_TAG_ARTIFACT_ORG
      )?.value,
      source:
        execution.application.tags.find(
          (t) => t.name === DEFAULT_EXECUTION_TAG_ARTIFACT_SOURCE
        )?.value ?? executionArtifact?.artifactSource.name,
    };

    const repository = {
      uid: execution.application.tags.find(
        (t) => t.name === DEFAULT_EXECUTION_TAG_ARTIFACT_REPO
      )?.value,
      organization,
    };

    const artifact: CICDArtifact = {
      uid: executionArtifact?.buildNo,
      repository,
    };

    if (
      artifact.uid &&
      artifact.repository.uid &&
      artifact.repository.organization.uid &&
      artifact.repository.organization.source
    ) {
      return artifact;
    } else {
      return undefined;
    }
  }

  private parseWorkflow(
    execution: HarnessExecutionNode,
    source: string
  ): ExecutionWorkflow | undefined {
    const outcome = execution.outcomes?.nodes.find(
      (o) => o.service?.artifactType
    );
    if (!outcome) {
      return undefined;
    }
    const artifactSource = outcome.service.artifactSources.find((a) => a.name);
    if (!artifactSource) {
      return undefined;
    }

    const build: CICDBuild = {
      uid: execution.id,
      pipeline: {
        uid:
          outcome.service.name ??
          execution.application.name ??
          artifactSource.name,
        organization: {
          uid: DEFAULT_CICD_ORGANIZATION_UID,
          source,
        },
      },
    };

    let artifact = undefined;
    // artifact computation needs to have application tags
    if (execution.application.tags) {
      artifact = this.parseArtifactFromTags(execution);
    }

    return {
      application: Common.computeApplication(
        execution.application.name ?? artifactSource.name,
        execution.application.tags?.find(
          (t) => t.name === DEFAULT_EXECUTION_TAG_APPLICATION_PLATFORM
        )?.value ?? ''
      ),
      env: outcome.environment.name ?? outcome.environment.type,
      build,
      artifact,
    };
  }

  private parsePipeline(
    execution: HarnessExecutionNode
  ): ExecutionPipeline | undefined {
    const service = execution.application.services?.nodes.find(
      (s) => s.artifactType
    );
    if (!service) {
      return;
    }
    const artifactSource = service.artifactSources.find((a) => a.name);
    const environment = execution.application.environments?.nodes.find(
      (e) => e.type
    );
    if (!artifactSource || !environment) {
      return;
    }
    return {
      application: Common.computeApplication(
        artifactSource.name,
        service.artifactType
      ),
      env: environment.name ?? environment.type,
    };
  }

  private toBuildStatus(status: string): {category: string; detail: string} {
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

  private toEnvironmentStatus(status: string): {
    category: string;
    detail: string;
  } {
    const statusLower = status.toLowerCase();
    if (statusLower.startsWith('prod')) {
      return {category: 'Prod', detail: status};
    }
    if (statusLower === 'staging') {
      return {category: 'Staging', detail: status};
    }
    if (statusLower.startsWith('dev')) {
      return {category: 'Dev', detail: status};
    }
    if (statusLower === 'qa') {
      return {category: 'QA', detail: status};
    }

    return {category: 'Custom', detail: status};
  }

  private toExecution(
    item: HarnessExecutionNode,
    source: string
  ): Execution | undefined {
    let implementation: ExecutionImplementation | undefined;

    if (item.outcomes) {
      implementation = this.parseWorkflow(item, source);
    } else {
      implementation = this.parsePipeline(item);
    }

    if (!implementation) {
      return;
    }

    return {
      uid: item.id,
      application: implementation.application,
      startedAt: item.startedAt,
      endedAt: item.endedAt,
      env: implementation.env,
      status: item.status,
      build: implementation.build,
      artifact: implementation.artifact,
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
