import {AirbyteLogger, AirbyteStreamBase} from 'faros-airbyte-cdk';

import {AzureReposConfig} from '../models';

export abstract class AzureReposStreamBase extends AirbyteStreamBase {
  constructor(
    protected readonly config: AzureReposConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }
}
