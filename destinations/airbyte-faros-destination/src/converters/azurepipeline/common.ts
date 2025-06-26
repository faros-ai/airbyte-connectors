import {BuildRepository} from 'azure-devops-node-api/interfaces/BuildInterfaces';
import {AirbyteRecord} from 'faros-airbyte-cdk';
import {toLower} from 'lodash';

import {getVcsOrgProjectFromUrl} from '../common/azure-devops';
import {BuildStateCategory, CicdOrgKey, JobCategory} from '../common/cicd';
import {CategoryDetail} from '../common/common';
import {RepoKey} from '../common/vcs';
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

  protected azurePipelineConfig(ctx: StreamContext): AzurePipelineConfig {
    return ctx.config?.source_specific_configs?.azurepipeline;
  }

  protected applicationMapping(ctx: StreamContext): ApplicationMapping {
    return this.azurePipelineConfig(ctx)?.application_mapping ?? {};
  }

  convertBuildState(result: string | undefined): CategoryDetail {
    if (!result) {
      return;
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

  vcs_Repository(repo: BuildRepository): RepoKey | undefined {
    const repoType = toLower(repo.type);

    if (repoType === 'tfsgit') {
      const {orgName, projectName} = getVcsOrgProjectFromUrl(repo.url);

      if (!orgName || !projectName) {
        return undefined;
      }
      const name = `${decodeURIComponent(projectName)}:${repo.name}`;
      return {
        uid: name,
        name,
        organization: this.getOrgKey(orgName, 'Azure-Repos'),
      };
    }

    if (repoType === 'github') {
      const parts = repo.id.split('/');
      // Expecting repo.id to be in the format of <org>/<repo>
      // E.g., faros-ai/airbyte-connectors
      if (parts.length < 2) {
        return undefined;
      }
      const name = toLower(parts[1]);
      return {
        uid: name,
        name,
        organization: this.getOrgKey(parts[0], 'GitHub'),
      };
    }

    return undefined;
  }

  getRepoUrl(repo: BuildRepository): string | undefined {
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

  convertBuildStepState(result: string | undefined): CategoryDetail {
    if (!result) {
      return {category: BuildStateCategory.Unknown, detail: 'undefined'};
    }
    //https://docs.microsoft.com/en-us/rest/api/azure/devops/build/timeline/get?view=azure-devops-rest-6.0#taskresult
    switch (result) {
      case 'abandoned':
      case 'canceled':
        return {category: BuildStateCategory.Canceled, detail: result};
      case 'failed':
        return {category: BuildStateCategory.Failed, detail: result};
      case 'succeeded':
      case 'succeededWithIssues':
        return {category: BuildStateCategory.Success, detail: result};
      default:
        return {category: BuildStateCategory.Custom, detail: result};
    }
  }

  convertBuildStepType(type: string): CategoryDetail {
    if (!type) {
      return;
    }
    return {category: JobCategory.Custom, detail: type};
  }

  protected getOrgKey(name: string, source?: string): CicdOrgKey {
    return {
      uid: name.toLowerCase(),
      source: source ?? this.streamName.source,
    };
  }

  /**
   * Get organization from source configuration
   */
  protected getOrganizationFromSourceConfig(ctx: StreamContext): string | undefined {
    return ctx.getSourceConfig()?.organization;
  }
}
