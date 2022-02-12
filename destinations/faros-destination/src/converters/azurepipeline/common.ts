import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';
import parseGitUrl from 'git-url-parse';

import {Converter} from '../converter';
import {
  BuildStateCategory,
  BuildTimeline,
  JobCategory,
  JobState,
  JobType,
  RepoExtract,
  Repository,
  Timestamps,
} from './models';

export type ApplicationMapping = Record<
  string,
  {name: string; platform?: string}
>;

interface AzurepipelineConfig {
  application_mapping?: ApplicationMapping;
}

/** Azurepipeline converter base */
export abstract class AzurepipelineConverter extends Converter {
  /** Almost every Azurepipeline record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  getOrganizationFromUrl(url: string): string {
    return url.split('/')[3];
  }
  convertBuildState(state: string | undefined): {
    category: string;
    detail: string;
  } {
    if (!state) {
      return {category: BuildStateCategory.Unknown, detail: 'undefined'};
    }
    const detail = state.toLowerCase();

    // Read more on Azurepipeline build states:
    // https://Azurepipeline.com/user/graphql/documentation/type/BuildStates
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

  // extractRepo(repoUrl: string): RepoExtract | undefined {
  //   const gitUrl = parseGitUrl(repoUrl);
  //   if (!gitUrl.organization || !gitUrl.name) return undefined;
  //   return {org: gitUrl.organization, name: gitUrl.name};
  // }

  getRepoUrl(repo: Repository): string | undefined {
    switch (repo.type) {
      case 'Bitbucket':
        return `https://bitbucket.org/${repo.id}`;
      case 'GitHub':
      case 'GitHubEnterprise':
        return `https://github.com/${repo.id}`;
      case 'GitLab':
        return `https://gitlab.com/${repo.id}`;
      case 'TfsGit':
        return repo.url;
      default:
        return repo.url;
    }
  }

  convertBuildStepTime(buildStep: BuildTimeline): Timestamps {
    //const type = buildStep.type;
    const result: Timestamps = {
      createdAt: Utils.toDate(buildStep.startTime),
      startedAt: Utils.toDate(buildStep.startTime),
      endedAt: Utils.toDate(buildStep.finishTime),
    };
    // switch (type) {
    //   case JobType.JobTypeBlock:
    //     result.createdAt = Utils.toDate(buildStep.unblockedAt);
    //     result.startedAt = Utils.toDate(buildStep.unblockedAt);
    //     result.endedAt = Utils.toDate(buildStep.unblockedAt);
    //     break;
    //   case JobType.JobTypeTrigger:
    //     result.createdAt = Utils.toDate(buildStep.createdAt);
    //     result.startedAt = Utils.toDate(buildStep.startedAt);
    //     result.endedAt = Utils.toDate(buildStep.finishedAt);
    //     break;
    //   case JobType.JobTypeWait: // This type does not currently have timestamps
    //   case JobType.JobTypeCommand:
    //   default:
    //     break;
    // }
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
    //https://docs.microsoft.com/en-us/rest/api/azure/devops/build/timeline/get?view=azure-devops-rest-6.0#taskresult
    switch (detail) {
      case 'abandoned':
      case 'canceled':
        return {category: BuildStateCategory.Canceled, detail};
      case 'failed':
      case 'skipped':
        return {category: BuildStateCategory.Failed, detail};
      case 'succeeded':
        return {category: BuildStateCategory.Success, detail};
      case 'succeededWithIssues':
        return {category: BuildStateCategory.Queued, detail};
      default:
        return {category: BuildStateCategory.Custom, detail};
    }
  }

  // TODO
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
