import {AirbyteLogger, AirbyteStreamBase} from 'faros-airbyte-cdk';

import {GitHubConfig} from '../types';

export abstract class StreamBase extends AirbyteStreamBase {
  constructor(
    protected readonly config: GitHubConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }
}
