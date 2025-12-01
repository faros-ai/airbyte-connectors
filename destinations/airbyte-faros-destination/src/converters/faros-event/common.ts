import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter, DestinationRecord} from '../converter';
import {
  Agent,
  Artifact,
  cicd_Agent,
  cicd_Artifact,
  cicd_Build,
  Commit,
  compute_Instance,
  faros_MetricValue,
  faros_Tag,
  FarosMetric,
  FarosPath,
  FarosTag,
  Run,
  RunStep,
  vcs_Commit,
} from './types';
import {
  BuildIds,
  parsePullRequestNumber,
  parseTags,
  resolveArtifactIds,
  resolveBuildIds,
  resolveCommitIds,
  resolveComputeAgentOS,
  resolveMetricDefinitionType,
  resolveRunStatus,
  resolveRunStepType,
  toDate,
} from './utils';

const STRING_TRUNCATION_LENGTH = 1000;

export type Maybe<T> = T | undefined;

export abstract class FarosEventConverter extends Converter {
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
  source = 'faros-event';
}

export function createArtifact(artifact: Artifact): cicd_Artifact {
  const artifactIds = resolveArtifactIds(artifact);
  return {
    uid: artifactIds.id,
    repository: {
      uid: artifactIds.repository,
      organization: {
        uid: artifactIds.organization,
        source: artifactIds.source,
      },
    },
  };
}

export function createArtifactRecords(
  artifact: Artifact,
  build?: cicd_Build
): {
  artifactKey: cicd_Artifact;
  artifactRecords: DestinationRecord[];
} {
  const artifactIds = resolveArtifactIds(artifact);

  const cicd_Organization = {
    uid: artifactIds.organization,
    source: artifactIds.source,
  };

  const cicd_Repository = {
    uid: artifactIds.repository,
    organization: cicd_Organization,
  };

  const artifactKey = {
    uid: artifactIds.id,
    repository: cicd_Repository,
  };
  const cicd_Artifact = {
    ...artifactKey,
    build,
  };

  return {
    artifactKey,
    artifactRecords: [
      {model: 'cicd_Organization', record: cicd_Organization},
      {model: 'cicd_Repository', record: cicd_Repository},
      {model: 'cicd_Artifact', record: cicd_Artifact},
    ],
  };
}

export function createCommitObjects(commit: Commit): {
  commitKey: vcs_Commit;
  commitRecords: DestinationRecord[];
} {
  const commitRecords: DestinationRecord[] = [];
  const commitIds = resolveCommitIds(commit);

  const vcs_Repository = {
    name: commitIds.repository,
    organization: {
      uid: commitIds.organization,
      source: commitIds.source,
    },
  };
  const vcs_Commit = {
    sha: commitIds.sha,
    repository: vcs_Repository,
  };

  if (commit.pullRequestNumber) {
    commitRecords.push({
      model: 'vcs_PullRequestCommit',
      record: {
        commit: vcs_Commit,
        pullRequest: {
          number: parsePullRequestNumber(commit.pullRequestNumber),
          repository: vcs_Repository,
        },
      },
    });
  }

  if (commit.branch) {
    const vcs_Branch = {
      name: commit.branch,
      repository: vcs_Repository,
    };
    const vcs_BranchCommitAssociation = {
      branch: vcs_Branch,
      commit: vcs_Commit,
    };
    commitRecords.push(
      {model: 'vcs_Branch', record: vcs_Branch},
      {
        model: 'vcs_BranchCommitAssociation',
        record: vcs_BranchCommitAssociation,
      }
    );
  }

  return {commitKey: vcs_Commit, commitRecords};
}

export function createBuildRecords(
  run: Run,
  skipSavingRun?: boolean
): {buildKey: cicd_Build; buildRecords: DestinationRecord[]} {
  const buildRecords: DestinationRecord[] = [];
  const buildIds = resolveBuildIds(run);

  const cicd_Organization = {
    uid: buildIds.organization,
    source: buildIds.source,
  };

  const cicd_Pipeline = {
    uid: buildIds.pipeline,
    organization: cicd_Organization,
    name: run.pipelineName,
    url: run.pipelineUrl,
  };

  const buildKey = {
    uid: buildIds.id,
    pipeline: cicd_Pipeline,
  };

  const cicd_Build = {
    ...buildKey,
    createdAt: toDate(run.createTime),
    startedAt: toDate(run.startTime),
    endedAt: toDate(run.endTime),
    status: resolveRunStatus(
      run.status,
      truncateStringOrNull(run.statusDetails)
    ),
    url: run.url,
    number: run.number,
  };

  const buildTags = parseTags(run.tags);
  if (buildTags?.length) {
    const {tagKeys, tagRecords} = createFarosTags(buildTags);
    buildRecords.push(...tagRecords);
    for (const tagKey of tagKeys) {
      const cicd_BuildTag = {
        build: buildKey,
        tag: tagKey,
      };
      buildRecords.push({model: 'cicd_BuildTag', record: cicd_BuildTag});
    }
  }

  if (run.metrics?.length) {
    const metricValueUid = buildIdsToString(buildIds);
    const {metricValueKeys, metricRecords} = createFarosMetricValues(
      run.metrics,
      metricValueUid
    );
    buildRecords.push(...metricRecords);
    for (const valueKey of metricValueKeys) {
      const cicd_BuildMetric = {
        build: buildKey,
        value: valueKey,
      };
      buildRecords.push({model: 'cicd_BuildMetric', record: cicd_BuildMetric});
    }
  }

  const step = run.step;
  if (step) {
    const func = (rs: RunStep): DestinationRecord[] => {
      const res: DestinationRecord[] = [];
      const buildStepKey = {
        uid: rs.id,
        build: buildKey,
      };
      const buildStepBody = {
        name: rs.name,
        status: resolveRunStatus(
          rs.status,
          truncateStringOrNull(rs.statusDetails)
        ),
        type: resolveRunStepType(rs.type, truncateStringOrNull(rs.typeDetails)),
        command: rs.command,
        url: rs.url,
        createdAt: toDate(rs.createTime),
        startedAt: toDate(rs.startTime),
        endedAt: toDate(rs.endTime),
      };

      const agent = rs.agent;
      let agentKey: Maybe<cicd_Agent>;
      if (agent) {
        const artifactRes = createAgentObjects(agent);
        agentKey = artifactRes.agentKey;
        res.push(...artifactRes.agentRecords);
      }

      const cicd_BuildStep = {
        ...buildStepKey,
        ...buildStepBody,
        ...(agentKey && {agent: agentKey}),
      };
      res.push({model: 'cicd_BuildStep', record: cicd_BuildStep});

      const buildStepTags = parseTags(rs.tags);
      if (buildStepTags?.length) {
        const {tagKeys, tagRecords} = createFarosTags(buildStepTags);
        res.push(...tagRecords);
        for (const tagKey of tagKeys) {
          const cicd_BuildStepTag = {
            buildStep: buildStepKey,
            tag: tagKey,
          };
          res.push({model: 'cicd_BuildStepTag', record: cicd_BuildStepTag});
        }
      }

      if (rs.metrics?.length) {
        const metricValueUid = buildStepIdsToString(buildIds, rs.id);
        const {metricValueKeys, metricRecords} = createFarosMetricValues(
          rs.metrics,
          metricValueUid
        );
        res.push(...metricRecords);
        for (const metricValueKey of metricValueKeys) {
          const cicd_BuildStepMetric = {
            buildStep: buildStepKey,
            value: metricValueKey,
          };
          res.push({
            model: 'cicd_BuildStepMetric',
            record: cicd_BuildStepMetric,
          });
        }
      }

      return res;
    };

    if (Array.isArray(step)) {
      for (const s of step) {
        buildRecords.push(...func(s));
      }
    } else {
      buildRecords.push(...func(step));
    }
  }

  if (!skipSavingRun) {
    buildRecords.push({model: 'cicd_Organization', record: cicd_Organization});
    buildRecords.push({model: 'cicd_Pipeline', record: cicd_Pipeline});
    buildRecords.push({model: 'cicd_Build', record: cicd_Build});
  }

  return {
    buildKey: cicd_Build,
    buildRecords,
  };
}

export function createAgentObjects(agent: Agent): {
  agentKey: cicd_Agent;
  agentRecords: DestinationRecord[];
} {
  const records: DestinationRecord[] = [];
  const agentKey = {uid: agent.id, source: agent.source};

  const host = agent.host;
  let hostKey: Maybe<compute_Instance>;
  if (host) {
    hostKey = {
      uid: host.id,
      source: host.source,
    };
    const compute_Instance = {
      ...hostKey,
      name: host.name,
      launchedAt: toDate(host.createTime),
      os: resolveComputeAgentOS(host.os, truncateStringOrNull(host.osDetails)),
      tags: parseTags(host.tags),
    };
    records.push({
      model: 'compute_Instance',
      record: compute_Instance,
    });
  }

  const cicd_Agent = {
    ...agentKey,
    name: agent.name,
    createdAt: agent.createTime,
    host: hostKey,
  };
  records.push({model: 'cicd_Agent', record: cicd_Agent});

  const agentTags = parseTags(agent.tags);
  if (agentTags?.length) {
    const {tagKeys, tagRecords} = createFarosTags(agentTags);
    records.push(...tagRecords);
    for (const tagKey of tagKeys) {
      const cicd_AgentTag = {
        agent: agentKey,
        tag: tagKey,
      };
      records.push({model: 'cicd_AgentTag', record: cicd_AgentTag});
    }
  }
  return {agentKey, agentRecords: records};
}

export function createFarosMetricValues(
  metrics: FarosMetric[],
  valueUid: string
): {metricValueKeys: faros_MetricValue[]; metricRecords: DestinationRecord[]} {
  const metricValueKeys: faros_MetricValue[] = [];
  const records: DestinationRecord[] = [];
  for (const {id, value, type, typeDetails} of metrics) {
    const metricDefinitionKey = {
      uid: id,
    };
    const faros_MetricDefinition = {
      ...metricDefinitionKey,
      name: id,
      valueType: resolveMetricDefinitionType(
        type,
        truncateStringOrNull(typeDetails)
      ),
      valueSource: {category: 'MetricValueEntries', detail: 'FAROS_EVENT_API'},
    };
    const metricValueKey = {
      uid: `${valueUid}__${id}`,
      definition: metricDefinitionKey,
    };
    const faros_MetricValue = {
      ...metricValueKey,
      value,
    };
    metricValueKeys.push(metricValueKey);
    records.push(
      {model: 'faros_MetricDefinition', record: faros_MetricDefinition},
      {model: 'faros_MetricValue', record: faros_MetricValue}
    );
  }
  return {metricValueKeys, metricRecords: records};
}

export function createFarosTags(tags: FarosTag[]): {
  tagKeys: faros_Tag[];
  tagRecords: DestinationRecord[];
} {
  const tagKeys: faros_Tag[] = [];
  const tagRecords: DestinationRecord[] = [];
  for (const tag of tags) {
    const tagKey = {
      uid: `${tag.key}__${tag.value}`,
    };
    const faros_Tag = {
      ...tagKey,
      key: tag.key,
      value: tag.value,
    };
    tagKeys.push(tagKey);
    tagRecords.push({model: 'faros_Tag', record: faros_Tag});
  }
  return {tagKeys, tagRecords};
}

export function createFarosPaths(
  paths: FarosPath[]
): {uid: string; path: string; parts: string[]}[] {
  return paths.map(({path: p}) => ({
    uid: p,
    path: p,
    parts: p.split('/'),
  }));
}

export function buildIdsToString(buildIds: BuildIds): string {
  return `${buildIds.source}__${buildIds.organization}__${buildIds.pipeline}__${buildIds.id}`;
}

export function buildStepIdsToString(
  buildIds: BuildIds,
  stepId: string
): string {
  return `${buildIdsToString(buildIds)}__${stepId}`;
}

export function truncateStringOrNull(str?: string): string | null {
  return str?.substring(0, STRING_TRUNCATION_LENGTH) ?? null;
}
