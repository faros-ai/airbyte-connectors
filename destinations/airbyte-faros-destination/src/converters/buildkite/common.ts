import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import parseGitUrl from 'git-url-parse';

import {Converter} from '../converter';

export interface Organization {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly web_url: string;
}

export interface Build {
  readonly uuid: string;
  readonly number: number;
  readonly message: string;
  readonly createdAt?: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly state: string;
  readonly url: string;
  readonly commit: string;
  readonly jobs: Array<Job>;
  readonly pipeline?: {
    slug?: string;
    readonly repository?: Repo;
    readonly organization?: {
      slug?: string;
    };
  };
}

export interface Job {
  readonly type: string;
  readonly uuid: string;
  readonly label?: string;
  readonly state: string;

  readonly createdAt?: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;

  readonly triggered?: {
    startedAt?: string;
    createdAt?: string;
    finishedAt?: string;
  };
  readonly unblockedAt?: string;

  readonly url?: string;
  readonly command: string;
  readonly build?: {
    uuid?: string;
    readonly pipeline?: {
      slug?: string;
      readonly organization?: {
        slug?: string;
      };
    };
  };
}

export interface Timestamps {
  createdAt?: Date;
  startedAt?: Date;
  endedAt?: Date;
}

export interface JobState {
  category: string;
  detail: string;
}
export interface Pipeline {
  readonly id: string;
  readonly uuid: string;
  readonly slug: string;
  readonly name: string;
  readonly url: string;
  readonly description?: string;
  readonly repository?: Repo;
  readonly createdAt?: string;
  readonly organization?: {
    slug?: string;
  };
}

export enum RepoSource {
  BITBUCKET = 'Bitbucket',
  GITHUB = 'GitHub',
  GITLAB = 'GitLab',
  VCS = 'VCS',
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

export enum JobType {
  JobTypeBlock = 'JobTypeBlock',
  JobTypeTrigger = 'JobTypeTrigger',
  JobTypeWait = 'JobTypeWait',
  JobTypeCommand = 'JobTypeCommand',
}

export enum JobCategory {
  Custom = 'Custom',
  Script = 'Script',
  Manual = 'Manual',
}

export interface Repo {
  readonly provider: Provider;
  readonly url: string;
}

export interface RepoExtract {
  readonly org: string;
  readonly name: string;
}

export interface Provider {
  readonly name: RepoSource;
}
/** Buildkite converter base */
export abstract class BuildkiteConverter extends Converter {
  source = 'Buildkite';
  /** Almost every Buildkite record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  convertBuildState(state: string | undefined): {
    category: string;
    detail: string;
  } {
    if (!state) {
      return {category: BuildStateCategory.Unknown, detail: 'undefined'};
    }
    const detail = state.toLowerCase();

    // Read more on Buildkite build states:
    // https://buildkite.com/user/graphql/documentation/type/BuildStates
    switch (detail) {
      case 'canceling':
      case 'canceled':
        return {category: BuildStateCategory.Canceled, detail};
      case 'failed':
        return {category: BuildStateCategory.Failed, detail};
      case 'passed':
        return {category: BuildStateCategory.Success, detail};
      case 'running':
        return {category: BuildStateCategory.Running, detail};
      case 'scheduled':
      case 'blocked':
        return {category: BuildStateCategory.Queued, detail};
      case 'skipped':
      case 'not_run':
      default:
        return {category: BuildStateCategory.Custom, detail};
    }
  }

  extractRepo(repoUrl: string): RepoExtract | undefined {
    const gitUrl = parseGitUrl(repoUrl);
    if (!gitUrl.organization || !gitUrl.name) return undefined;
    return {org: gitUrl.organization, name: gitUrl.name};
  }

  convertBuildStepTime(buildStep: Job): Timestamps {
    const type = buildStep.type;
    const result: Timestamps = {
      createdAt: Utils.toDate(buildStep.createdAt),
      startedAt: Utils.toDate(buildStep.startedAt),
      endedAt: Utils.toDate(buildStep.finishedAt),
    };
    switch (type) {
      case JobType.JobTypeBlock:
        result.createdAt = Utils.toDate(buildStep.unblockedAt);
        result.startedAt = Utils.toDate(buildStep.unblockedAt);
        result.endedAt = Utils.toDate(buildStep.unblockedAt);
        break;
      case JobType.JobTypeTrigger:
        result.createdAt = Utils.toDate(buildStep.createdAt);
        result.startedAt = Utils.toDate(buildStep.startedAt);
        result.endedAt = Utils.toDate(buildStep.finishedAt);
        break;
      case JobType.JobTypeWait: // This type does not currently have timestamps
      case JobType.JobTypeCommand:
      default:
        break;
    }
    return result;
  }

  convertBuildStepState(state: string | undefined): {
    category: string;
    detail: string;
  } {
    if (!state) {
      return {category: BuildStateCategory.Unknown, detail: 'undefined'};
    }
    const detail = state.toLowerCase();

    // Read more on Buildkite job states:
    // https://buildkite.com/user/graphql/documentation/type/JobStates
    switch (detail) {
      case 'canceling':
      case 'canceled':
        return {category: BuildStateCategory.Canceled, detail};
      case 'blocked_failed':
      case 'broken':
      case 'timed_out':
      case 'timing_out':
      case 'unblocked_failed':
      case 'waiting_failed':
        return {category: BuildStateCategory.Failed, detail};
      case 'finished':
        return {category: BuildStateCategory.Success, detail};
      case 'running':
        return {category: BuildStateCategory.Running, detail};
      case 'scheduled':
      case 'accepted':
      case 'assigned':
      case 'blocked':
      case 'limited':
      case 'limiting':
      case 'waiting':
        return {category: BuildStateCategory.Queued, detail};
      case 'skipped':
      case 'pending':
      case 'unblocked':
      default:
        return {category: BuildStateCategory.Custom, detail};
    }
  }

  convertBuildStepType(type: string): JobState {
    if (!type) {
      return {category: JobCategory.Custom, detail: 'undefined'};
    }
    const detail = type;
    switch (type) {
      case JobType.JobTypeCommand:
        return {category: JobCategory.Script, detail};
      case JobType.JobTypeBlock:
        return {category: JobCategory.Manual, detail};
      case JobType.JobTypeWait:
      default:
        return {category: JobCategory.Custom, detail};
    }
  }
}
