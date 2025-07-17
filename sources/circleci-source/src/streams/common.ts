import {AirbyteLogger, AirbyteStreamBase} from 'faros-airbyte-cdk';
import {bucket} from 'faros-airbyte-common/common';

import {CircleCI, CircleCIConfig} from '../circleci/circleci';

export abstract class StreamWithProjectSlices extends AirbyteStreamBase {
  constructor(
    protected readonly cfg: CircleCIConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  async *streamSlices(): AsyncGenerator<ProjectSlice> {
    for (const projectSlug of this.cfg.project_slugs) {
      if (this.isProjectInBucket(projectSlug)) {
        yield {projectSlug};
      }
    }
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

export type ProjectSlice = {
  projectSlug: string;
};

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
        orgName: org.name,
      };
    }
  }
}

export type OrganizationSlice = {
  orgId: string;
  orgSlug: string;
  orgName: string;
};
