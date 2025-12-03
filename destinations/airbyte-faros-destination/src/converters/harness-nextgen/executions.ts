import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {
  CICDBuild,
  computeApplication,
  HarnessNextgenConverter,
  HarnessNextgenExecution,
  toHarnessStatus,
} from './common';

export class Executions extends HarnessNextgenConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Build',
    'cicd_Deployment',
    'compute_Application',
  ];

  private seenApplications = new Set<string>();
  private seenPipelines = new Set<string>();

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const execution = record.record.data as HarnessNextgenExecution;
    const source = this.streamName.source;
    const res: DestinationRecord[] = [];

    const orgUid = execution.orgIdentifier;
    const projectUid = execution.projectIdentifier;
    const pipelineUid = `${orgUid}/${projectUid}/${execution.pipelineIdentifier}`;

    // Get service and environment from moduleInfo if available
    const serviceIdentifier = execution.moduleInfo?.cd?.serviceIdentifiers?.[0];
    const envIdentifier = execution.moduleInfo?.cd?.envIdentifiers?.[0];

    // Compute application from service or pipeline name
    const appName = serviceIdentifier ?? execution.pipelineIdentifier;
    const application = computeApplication(appName);
    const appKey = application.uid;

    if (!this.seenApplications.has(appKey)) {
      res.push({model: 'compute_Application', record: application});
      this.seenApplications.add(appKey);
    }

    // Create pipeline/organization if not seen
    const pipelineKey = pipelineUid;
    if (!this.seenPipelines.has(pipelineKey)) {
      res.push({
        model: 'cicd_Organization',
        record: {
          uid: orgUid,
          source,
        },
      });
      res.push({
        model: 'cicd_Pipeline',
        record: {
          uid: pipelineUid,
          organization: {uid: orgUid, source},
        },
      });
      this.seenPipelines.add(pipelineKey);
    }

    const build: CICDBuild = {
      uid: execution.planExecutionId,
      pipeline: {
        uid: pipelineUid,
        organization: {uid: orgUid, source},
      },
    };

    const status = toHarnessStatus(execution.status);
    const deployment = {uid: execution.planExecutionId, source};

    res.push({
      model: 'cicd_Deployment',
      record: {
        ...deployment,
        application,
        build,
        startedAt: Utils.toDate(execution.startTs),
        endedAt: Utils.toDate(execution.endTs),
        env: this.toEnvironmentStatus(envIdentifier ?? 'unknown'),
        status,
      },
    });

    res.push({
      model: 'cicd_Build',
      record: {
        ...build,
        name: execution.name,
        number: execution.runSequence,
        startedAt: Utils.toDate(execution.startTs),
        endedAt: Utils.toDate(execution.endTs),
        status,
      },
    });

    return res;
  }

  private toEnvironmentStatus(env: string): {
    category: string;
    detail: string;
  } {
    const envLower = env?.toLowerCase() ?? '';
    if (envLower.startsWith('prod') || envLower === 'production') {
      return {category: 'Prod', detail: env};
    }
    if (envLower === 'staging' || envLower === 'stage') {
      return {category: 'Staging', detail: env};
    }
    if (envLower.startsWith('dev') || envLower === 'development') {
      return {category: 'Dev', detail: env};
    }
    if (envLower === 'qa' || envLower === 'test' || envLower === 'testing') {
      return {category: 'QA', detail: env};
    }

    return {category: 'Custom', detail: env};
  }
}
