import {AirbyteRecord} from 'faros-airbyte-cdk';
import {
  BuildStateCategory,
  BuildTimeline,
  DeploymentStatus,
  DeploymentStatusCategory,
  JobCategory,
  JobState,
  Repository,
  Timestamps,
} from 'faros-airbyte-common/azurepipeline';
import {Utils} from 'faros-js-client';
import {toLower} from 'lodash';

import {Converter, StreamContext} from '../converter';

export type ApplicationMapping = Record<
  string,
  {name: string; platform?: string}
>;

interface AzurePipelineConfig {
  application_mapping?: ApplicationMapping;
}

/** Azurepipeline converter base */
export abstract class AzurePipelineConverter extends Converter {
  source = 'AzurePipeline';
  /** Almost every Azurepipeline record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  getOrganizationFromUrl(url: string): string | undefined {
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== 'dev.azure.com') {
        return undefined;
      }
      const parts = parsed.pathname.split('/');

      if (parts.length < 2 || parts[1] === '') {
        return undefined;
      }

      return parts[1];
    } catch (error) {
      return undefined;
    }
  }

  getProjectFromUrl(url: string): string | undefined {
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== 'dev.azure.com') {
        return undefined;
      }
      const parts = parsed.pathname.split('/');

      if (parts.length < 3 || parts[2] === '') {
        return undefined;
      }

      return parts[2];
    } catch (error) {
      return undefined;
    }
  }

  protected azurePipelineConfig(ctx: StreamContext): AzurePipelineConfig {
    return ctx.config?.source_specific_configs?.azurepipeline;
  }

  protected applicationMapping(ctx: StreamContext): ApplicationMapping {
    return this.azurePipelineConfig(ctx)?.application_mapping ?? {};
  }

  convertBuildState(result: string | undefined): {
    category: string;
    detail: string;
  } {
    if (!result) {
      return {category: BuildStateCategory.Unknown, detail: 'undefined'};
    }
    // Read more on Azure pipeline build result:
    // https://docs.microsoft.com/en-us/rest/api/azure/devops/build/builds/list?view=azure-devops-rest-6.0#buildresult
    switch (result) {
      case 'canceled':
        return {category: BuildStateCategory.Canceled, detail: result};
      case 'failed':
        return {category: BuildStateCategory.Failed, detail: result};
      case 'succeeded':
      case 'partiallySucceeded':
        return {category: BuildStateCategory.Success, detail: result};
      case 'running':
        return {category: BuildStateCategory.Running, detail: result};
      default:
        return {category: BuildStateCategory.Custom, detail: result};
    }
  }

  vcs_Repository(repo: Repository): any | undefined {
    const repoType = toLower(repo.type);

    if (repoType === 'tfsgit') {
      const orgName = this.getOrganizationFromUrl(repo.url);
      const projectName = this.getProjectFromUrl(repo.url);

      if (!orgName || !projectName) {
        return undefined;
      }

      return {
        name: `${decodeURIComponent(projectName)}_${repo.name}`,
        organization: {
          uid: orgName,
          source: 'Azure-Repos',
        },
      };
    }

    if (repoType === 'github') {
      const parts = repo.id.split('/');
      // Expecting repo.id to be in the format of <org>/<repo>
      // E.g., faros-ai/airbyte-connectors
      if (parts.length < 2) {
        return undefined;
      }

      return {
        name: toLower(parts[1]),
        organization: {
          uid: toLower(parts[0]),
          source: 'GitHub',
        },
      };
    }

    return undefined;
  }

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
    return result;
  }

  convertBuildStepState(result: string | undefined): {
    category: string;
    detail: string;
  } {
    if (!result) {
      return {category: BuildStateCategory.Unknown, detail: 'undefined'};
    }
    //https://docs.microsoft.com/en-us/rest/api/azure/devops/build/timeline/get?view=azure-devops-rest-6.0#taskresult
    switch (result) {
      case 'abandoned':
      case 'canceled':
        return {category: BuildStateCategory.Canceled, detail: result};
      case 'failed':
      case 'skipped':
        return {category: BuildStateCategory.Failed, detail: result};
      case 'succeeded':
      case 'succeededWithIssues':
        return {category: BuildStateCategory.Success, detail: result};
      default:
        return {category: BuildStateCategory.Custom, detail: result};
    }
  }

  // TODO
  convertBuildStepType(type: string): JobState {
    if (!type) {
      return {category: JobCategory.Custom, detail: 'undefined'};
    }
    return {category: JobCategory.Custom, detail: type};
  }

  convertDeploymentStatus(result: string): DeploymentStatus {
    if (!result) {
      return {category: DeploymentStatusCategory.Custom, detail: 'undefined'};
    }
    const detail = result;
    switch (result) {
      case 'canceled':
        return {category: DeploymentStatusCategory.Canceled, detail};
      case 'failed':
        return {category: DeploymentStatusCategory.Failed, detail};
      case 'succeeded':
        return {category: DeploymentStatusCategory.Success, detail};
      default:
        return {category: DeploymentStatusCategory.Custom, detail};
    }
  }
}
