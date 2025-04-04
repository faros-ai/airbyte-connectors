import {StreamContext} from '../converter';
import {getQueryFromName} from '../vanta/utils';

export interface CicdOrgKey {
  uid: string;
  source: string;
}

export interface CicdRepoKey {
  organization: CicdOrgKey;
  uid: string;
}

export interface ArtifactKey {
  uid: string;
  repository: CicdRepoKey;
}

export enum BuildStateCategory {
  Unknown = 'Unknown',
  Canceled = 'Canceled',
  Failed = 'Failed',
  Success = 'Success',
  Running = 'Running',
  Queued = 'Queued',
  Custom = 'Custom',
}

export enum JobCategory {
  Custom = 'Custom',
  Script = 'Script',
  Manual = 'Manual',
}

export interface BuildKey {
  readonly uid: string;
  readonly pipeline: PipelineKey;
}

interface PipelineKey {
  readonly uid: string;
  readonly organization: {
    readonly uid: string;
    readonly source: string;
  };
}

const cicdArtifactQueryByCommitSha = getQueryFromName(
  'cicdArtifactQueryByCommitSha'
);

export async function getCICDArtifactsFromCommitShas(
  commitShas: string[],
  ctx: StreamContext
): Promise<ArtifactKey[] | null> {
  const result = await ctx.farosClient.gql(
    ctx.graph,
    cicdArtifactQueryByCommitSha,
    {
      commitShas,
    }
  );
  return result?.cicd_Artifact;
}
