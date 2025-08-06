import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationRecord, StreamContext} from '../converter';
import {
  createArtifact,
  createArtifactRecords,
  createBuildRecords,
  createCommitObjects,
  createFarosPaths,
  createFarosTags,
  FarosEventConverter,
  Maybe,
  truncateStringOrNull,
} from './common';
import {
  CDEvent,
  cicd_Artifact,
  cicd_Build,
  cicd_Deployment,
  Deploy,
  Params,
  validCDEvent,
  validParams,
} from './types';
import {
  makeDummyArtifact,
  parsePaths,
  parseTags,
  resolveDeploymentEnvironment,
  resolveDeploymentIds,
  resolveDeploymentStatus,
  toDate,
} from './utils';

interface CdEventArgs {
  readonly data: CDEvent;
  readonly params?: Params;
}

export class CdEvents extends FarosEventConverter {
  readonly destinationModels = [
    'cicd_Agent',
    'cicd_AgentTag',
    'cicd_Artifact',
    'cicd_ArtifactCommitAssociation',
    'cicd_ArtifactDeployment',
    'cicd_Build',
    'cicd_BuildCommitAssociation',
    'cicd_BuildMetric',
    'cicd_BuildStep',
    'cicd_BuildStepMetric',
    'cicd_BuildStepTag',
    'cicd_BuildTag',
    'cicd_Deployment',
    'cicd_DeploymentTag',
    'cicd_Organization',
    'cicd_Pipeline',
    'cicd_Repository',
    'compute_Application',
    'compute_ApplicationPath',
    'compute_ApplicationTag',
    'compute_Instance',
    'faros_MetricDefinition',
    'faros_MetricValue',
    'faros_Path',
    'faros_Tag',
    'vcs_Branch',
    'vcs_BranchCommitAssociation',
    'vcs_PullRequestCommit',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<readonly DestinationRecord[]> {
    const data = record.record.data as CdEventArgs;

    if (
      validParams(ctx.logger, data.params) &&
      validCDEvent(ctx.logger, data.data)
    ) {
      return handleCDEvent(data);
    }
    return [];
  }
}

export function handleCDEvent(
  args: CdEventArgs
): ReadonlyArray<DestinationRecord> {
  const {data, params} = args;
  const {skipSavingRun, noDeployUidPrefix} = params || {};
  const records: DestinationRecord[] = [];

  let buildKey: Maybe<cicd_Build>;
  if (data.run) {
    const buildRes = createBuildRecords(data.run, skipSavingRun);
    buildKey = buildRes.buildKey;
    records.push(...buildRes.buildRecords);
  }

  let deploymentKey: Maybe<cicd_Deployment>;
  if (data.deploy) {
    const deployRes = createDeployObjects(
      data.deploy,
      buildKey,
      noDeployUidPrefix
    );
    deploymentKey = deployRes.deploymentKey;
    records.push(...deployRes.deploymentRecords);
  }

  let artifactKey: Maybe<cicd_Artifact>;
  if (data.artifact) {
    artifactKey = createArtifact(data.artifact);
  }

  if (data.commit) {
    const {commitKey, commitRecords} = createCommitObjects(data.commit);
    records.push(...commitRecords);

    if (!artifactKey) {
      // construct dummy artifact from commit
      const artifactRes = createArtifactRecords(makeDummyArtifact(data.commit));
      artifactKey = artifactRes.artifactKey;
      records.push(...artifactRes.artifactRecords);
    }

    records.push({
      model: 'cicd_ArtifactCommitAssociation',
      record: {artifact: artifactKey, commit: commitKey},
    });
  }

  if (deploymentKey && artifactKey) {
    records.push({
      model: 'cicd_ArtifactDeployment',
      record: {artifact: artifactKey, deployment: deploymentKey},
    });
  }

  return records;
}

function createDeployObjects(
  deploy: Deploy,
  buildKey?: cicd_Build,
  noDeployUidPrefix?: boolean
): {deploymentKey: cicd_Deployment; deploymentRecords: DestinationRecord[]} {
  const deploymentRecords: DestinationRecord[] = [];
  const deployIds = resolveDeploymentIds(deploy);

  const applicationKey = {
    name: deployIds.application,
    platform: deploy.applicationPlatform ?? '',
  };
  deploymentRecords.push({
    model: 'compute_Application',
    record: applicationKey,
  });

  const applicationTags = parseTags(deploy.applicationTags);
  if (applicationTags?.length) {
    const {tagKeys, tagRecords} = createFarosTags(applicationTags);
    deploymentRecords.push(...tagRecords);
    for (const tagKey of tagKeys) {
      const compute_ApplicationTag = {
        application: applicationKey,
        tag: tagKey,
      };
      deploymentRecords.push({
        model: 'compute_ApplicationTag',
        record: compute_ApplicationTag,
      });
    }
  }

  const applicationPaths = parsePaths(deploy.applicationPaths);
  if (applicationPaths?.length) {
    const paths = createFarosPaths(applicationPaths);
    for (const faros_Path of paths) {
      const compute_ApplicationPath = {
        application: applicationKey,
        path: faros_Path,
      };
      deploymentRecords.push({
        model: 'faros_Path',
        record: faros_Path,
      });
      deploymentRecords.push({
        model: 'compute_ApplicationPath',
        record: compute_ApplicationPath,
      });
    }
  }

  const deployment_uid_prefix = noDeployUidPrefix
    ? ''
    : `${deployIds.application}__${deployIds.environment}__`;

  const deploymentKey = {
    uid: `${deployment_uid_prefix}${deployIds.id}`,
    source: deployIds.source,
  };

  const cicd_Deployment = {
    ...deploymentKey,
    url: deploy.url,
    env: resolveDeploymentEnvironment(
      deployIds.environment,
      truncateStringOrNull(deploy.environmentDetails)
    ),
    requestedAt: toDate(deploy.requestedAt),
    startedAt: toDate(deploy.startTime),
    endedAt: toDate(deploy.endTime),
    status: resolveDeploymentStatus(
      deploy.status,
      truncateStringOrNull(deploy.statusDetails)
    ),
    application: applicationKey,
    build: buildKey,
  };
  deploymentRecords.push({model: 'cicd_Deployment', record: cicd_Deployment});

  const deploymentTags = parseTags(deploy.tags);
  if (deploymentTags?.length) {
    const {tagKeys, tagRecords} = createFarosTags(deploymentTags);
    deploymentRecords.push(...tagRecords);
    for (const tagKey of tagKeys) {
      const cicd_DeploymentTag = {
        deployment: deploymentKey,
        tag: tagKey,
      };
      deploymentRecords.push({
        model: 'cicd_DeploymentTag',
        record: cicd_DeploymentTag,
      });
    }
  }

  return {deploymentKey, deploymentRecords};
}
