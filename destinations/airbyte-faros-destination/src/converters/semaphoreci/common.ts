import parseGitUrl from 'git-url-parse';

import {Converter} from '../converter';
import {
  BuildStateCategory,
  Pipeline,
  PipelineResult,
  RepoGitSource,
  Repository,
  RepoSource,
} from './models';

/** Buildkite converter base */
export abstract class SemaphoreCIConverter extends Converter {
  source = 'SemaphoreCI';
}

export class SemaphoreCICommon {
  static getVCSSourceFromUrl(repoUrl: string): RepoSource | undefined {
    switch (parseGitUrl(repoUrl).source) {
      case RepoGitSource.GITHUB:
        return RepoSource.GITHUB;
      case RepoGitSource.BITBUCKET:
        return RepoSource.BITBUCKET;
      default:
        'undefined';
    }
  }

  static buildVCSUrls(
    repository: Repository,
    source: RepoSource
  ): {
    organization: string;
    repository: string;
  } {
    const urls = {
      organization: '',
      repository: '',
    };

    switch (source) {
      case RepoSource.GITHUB:
        urls.organization = `https://github.com/${repository.owner}`;
        urls.repository = `https://github.com/${repository.owner}/${repository.name}`;
        break;
    }

    return urls;
  }

  static buildOrganizationUrl(organizationName: string): string {
    return `https://${organizationName}.semaphoreci.com`;
  }

  static buildArtifactRepoUrl(
    organizationName: string,
    projectName: string
  ): string {
    return `https://${organizationName}.semaphoreci.com/projects/${projectName}`;
  }

  static buildPipelineUrl(pipeline: Pipeline, repository: Repository): string {
    const baseUrl = this.buildOrganizationUrl(repository.owner);

    return `${baseUrl}/workflows/${pipeline.wf_id}?pipeline_id=${pipeline.ppl_id}`;
  }

  static buildCICDUrls(repository: Repository): {
    organization: string;
    repository: string;
  } {
    return {
      organization: `https://${repository.owner}.semaphoreci.com`,
      repository: `https://${repository.owner}.semaphoreci.com/projects/${repository.name}`,
    };
  }

  static convertBuildState(state: string | undefined): {
    category: string;
    detail: string;
  } {
    if (!state) {
      return {category: BuildStateCategory.Unknown, detail: 'undefined'};
    }
    const detail = state.toLowerCase();

    switch (detail) {
      case PipelineResult.Canceled:
      case PipelineResult.Stopped:
        return {category: BuildStateCategory.Canceled, detail};
      case PipelineResult.Failed:
        return {category: BuildStateCategory.Failed, detail};
      case PipelineResult.Passed:
        return {category: BuildStateCategory.Success, detail};
      default:
        return {category: BuildStateCategory.Custom, detail};
    }
  }

  static nullifyDate(isoDate: string): string | undefined {
    if (new Date(0).toISOString() === isoDate) {
      return;
    }

    return isoDate;
  }
}
