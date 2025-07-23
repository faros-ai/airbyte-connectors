import {AirbyteLogger} from 'faros-airbyte-cdk';

import {GerritConfig} from './types';

export class ProjectFilter {
  private static instance_: ProjectFilter;

  constructor(
    private readonly config: GerritConfig,
    private readonly logger: AirbyteLogger
  ) {}

  static instance(config: GerritConfig, logger: AirbyteLogger): ProjectFilter {
    if (ProjectFilter.instance_) return ProjectFilter.instance_;

    ProjectFilter.instance_ = new ProjectFilter(config, logger);
    return ProjectFilter.instance_;
  }

  shouldIncludeProject(projectName: string): boolean {
    // If specific projects are listed, only include those
    if (this.config.projects?.length) {
      return this.config.projects.includes(projectName);
    }

    // If project is in excluded list, skip it
    if (this.config.excluded_projects?.includes(projectName)) {
      return false;
    }

    // Include all other projects
    return true;
  }

  getProjectsToFetch(): string[] | undefined {
    return this.config.projects;
  }

  applyBucketing(projects: string[]): string[] {
    const bucketId = this.config.bucket_id ?? 1;
    const bucketTotal = this.config.bucket_total ?? 1;

    if (bucketTotal <= 1) {
      return projects;
    }

    this.logger.info(
      `Applying bucketing: bucket ${bucketId} of ${bucketTotal} total buckets`
    );

    return projects.filter((project, index) => {
      const bucket = (index % bucketTotal) + 1;
      return bucket === bucketId;
    });
  }
}
