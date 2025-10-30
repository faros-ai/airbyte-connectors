import {AirbyteLogger, AirbyteStreamBase} from 'faros-airbyte-cdk';
import {bucket} from 'faros-airbyte-common/common';

import {CircleCI, CircleCIConfig} from '../circleci/circleci';

export enum RunMode {
  Standard = 'Standard',
  Usage = 'Usage',
  Custom = 'Custom',
}

export const DEFAULT_RUN_MODE = RunMode.Standard;

// Stream collections for different run modes
export const StandardStreamNames = ['projects', 'pipelines', 'tests'];

export const UsageStreamNames = ['usage'];

export const CustomStreamNames = ['projects', 'pipelines', 'tests', 'usage'];

export const RunModeStreams: {
  [key in RunMode]: string[];
} = {
  [RunMode.Standard]: StandardStreamNames,
  [RunMode.Usage]: UsageStreamNames,
  [RunMode.Custom]: CustomStreamNames,
};

export type ProjectSlice = {
  projectSlug: string;
};

export type OrganizationSlice = {
  orgId: string;
  orgSlug: string;
};

export abstract class StreamWithProjectSlices extends AirbyteStreamBase {
  constructor(
    protected readonly cfg: CircleCIConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  async *streamSlices(): AsyncGenerator<ProjectSlice> {
    const projectSlugs = this.cfg.project_slugs ?? [];
    const selectedProjects: string[] = [];
    for (const projectSlug of projectSlugs) {
      if (this.isProjectInBucket(projectSlug)) {
        selectedProjects.push(projectSlug);
        yield {projectSlug};
      }
    }
    const bucketId = this.cfg.bucket_id ?? 1;
    const bucketTotal = this.cfg.bucket_total ?? 1;
    const uniqueVisible = Array.from(new Set(projectSlugs));
    const uniqueSelected = Array.from(new Set(selectedProjects));
    this.logger.info(
      `[Bucketing] CircleCI bucket ${bucketId}/${bucketTotal} - visible projects (${uniqueVisible.length}): ${uniqueVisible.length ? uniqueVisible.join(', ') : '<none>'}; selected for current bucket (${uniqueSelected.length}): ${uniqueSelected.length ? uniqueSelected.join(', ') : '<none>'}`
    );
  }

  isProjectInBucket(project: string): boolean {
    return (
      bucket(
        'farosai/airbyte-circleci-source',
        project,
        this.cfg.bucket_total
      ) === this.cfg.bucket_id
    );
  }
}

export abstract class StreamWithOrganizationSlices extends AirbyteStreamBase {
  constructor(
    protected readonly cfg: CircleCIConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  async *streamSlices(): AsyncGenerator<OrganizationSlice> {
    const circleCI = CircleCI.instance(this.cfg, this.logger);
    const organizations = await circleCI.getAllOrganizations();

    for (const org of organizations) {
      yield {
        orgId: org.id,
        orgSlug: org.slug,
      };
    }
  }
}
