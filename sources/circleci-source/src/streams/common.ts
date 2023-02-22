import {AirbyteLogger, AirbyteStreamBase} from 'faros-airbyte-cdk';

import {CircleCI, CircleCIConfig} from '../circleci/circleci';

export abstract class StreamBase extends AirbyteStreamBase {
  protected circleCI: CircleCI;

  constructor(
    protected readonly cfg: CircleCIConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
    this.circleCI = CircleCI.instance(cfg, logger);
  }
}
