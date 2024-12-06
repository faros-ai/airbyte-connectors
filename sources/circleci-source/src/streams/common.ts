import {AirbyteLogger, AirbyteStreamBase} from 'faros-airbyte-cdk';

import {CircleCI, CircleCIConfig} from '../circleci/circleci';

export abstract class StreamWithProjectSlices extends AirbyteStreamBase {
  constructor(
    protected readonly circleCI: CircleCI,
    protected readonly cfg: CircleCIConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    for (const projectSlug of this.cfg.project_slugs) {
      if (this.circleCI.isProjectInBucket(projectSlug)) {
        yield {projectSlug};
      }
    }
  }
}

export type StreamSlice = {
  projectSlug: string;
};
