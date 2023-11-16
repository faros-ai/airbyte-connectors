import {AirbyteLogger, AirbyteStreamBase} from 'faros-airbyte-cdk';

import {CircleCIConfig} from '../circleci/circleci';

export abstract class CircleCIStreamBase extends AirbyteStreamBase {
  constructor(
    protected readonly cfg: CircleCIConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }
}

export type StreamSlice = {
  projectName: string;
};
