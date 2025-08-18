import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationRecord, StreamContext} from '../converter';
import {
  createArtifactRecords,
  createBuildRecords,
  createCommitObjects,
  FarosEventConverter,
  Maybe,
} from './common';
import {
  cicd_Artifact,
  cicd_Build,
  CIEvent,
  Params,
  validCIEvent,
  validParams,
  vcs_Commit,
} from './types';
import {makeDummyArtifact} from './utils';

interface CiEventArgs {
  readonly data: CIEvent;
  readonly params?: Params;
}

export class CiEvents extends FarosEventConverter {
  readonly destinationModels = [
    'cicd_Agent',
    'cicd_AgentTag',
    'cicd_Artifact',
    'cicd_ArtifactCommitAssociation',
    'cicd_Build',
    'cicd_BuildCommitAssociation',
    'cicd_BuildMetric',
    'cicd_BuildStep',
    'cicd_BuildStepMetric',
    'cicd_BuildStepTag',
    'cicd_BuildTag',
    'cicd_Organization',
    'cicd_Pipeline',
    'cicd_Repository',
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
    const data = record.record.data as CiEventArgs;

    if (
      validParams(ctx.logger, data.params) &&
      validCIEvent(ctx.logger, data.data)
    ) {
      return handleCIEvent(data);
    }
    return [];
  }
}

export function handleCIEvent(args: CiEventArgs): DestinationRecord[] {
  const {data, params} = args;
  const {skipSavingRun, noArtifact} = params || {};
  const records: DestinationRecord[] = [];

  let buildKey: Maybe<cicd_Build>;
  if (data.run) {
    const buildRes = createBuildRecords(data.run, skipSavingRun);
    buildKey = buildRes.buildKey;
    records.push(...buildRes.buildRecords);
  }

  let commitKey: Maybe<vcs_Commit>;
  if (data.commit) {
    const commitRes = createCommitObjects(data.commit);
    commitKey = commitRes.commitKey;
    records.push(...commitRes.commitRecords);

    if (buildKey) {
      records.push({
        model: 'cicd_BuildCommitAssociation',
        record: {build: buildKey, commit: commitKey},
      });
    }
  }

  let artifactKey: Maybe<cicd_Artifact>;
  if (!noArtifact) {
    if (data.artifact) {
      const artifactRes = createArtifactRecords(data.artifact, buildKey);
      artifactKey = artifactRes.artifactKey;
      records.push(...artifactRes.artifactRecords);
    } else if (data.commit) {
      // construct dummy artifact from commit
      const dummyArtifactRes = createArtifactRecords(
        makeDummyArtifact(data.commit)
      );
      artifactKey = dummyArtifactRes.artifactKey;
      records.push(...dummyArtifactRes.artifactRecords);
    }
  }

  if (commitKey && artifactKey) {
    records.push({
      model: 'cicd_ArtifactCommitAssociation',
      record: {
        artifact: artifactKey,
        commit: commitKey,
      },
    });
  }

  return records;
}
