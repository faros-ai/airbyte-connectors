import {Converter} from '../converter';
import {
  BuildStateCategory,
  Pipeline,
  PipelineResult,
  Repository,
} from './models';

/** Buildkite converter base */
export abstract class SemaphoreCIConverter extends Converter {
  source = 'SemaphoreCI';
}

export class SemaphoreCICommon {
  static buildOrganizationUrl(organization: string): string {
    return `https://${organization}.semaphore.com`;
  }

  static buildRepositoryUrl(repository: Repository): string {
    let repoUrl = '';

    switch (repository.integration_type) {
      case 'github_app':
        repoUrl = `https://github.com/${repository.owner}/${repository.name}`;
        break;
    }

    return repoUrl;
  }

  static buildPipelineUrl(pipeline: Pipeline): string {
    const baseUrl = this.buildOrganizationUrl(
      pipeline.project.spec.repository.owner
    );

    return `${baseUrl}/workflows/${pipeline.wf_id}?pipeline_id=${pipeline.ppl_id}`;
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
}
