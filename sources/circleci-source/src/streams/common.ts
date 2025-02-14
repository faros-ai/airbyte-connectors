import {AirbyteLogger, AirbyteStreamBase} from 'faros-airbyte-cdk';
import {bucket} from 'faros-airbyte-common/common';

import {CircleCIConfig} from '../circleci/circleci';

export abstract class StreamWithProjectSlices extends AirbyteStreamBase {
  constructor(
    protected readonly cfg: CircleCIConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
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

export type StreamSlice = {
  projectSlug: string;
};
