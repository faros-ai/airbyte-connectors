import {AirbyteLogger, AirbyteStreamBase} from 'faros-airbyte-cdk';

import {Gerrit} from '../gerrit';
import {ProjectFilter} from '../project-filter';
import {GerritConfig} from '../types';

export abstract class StreamBase extends AirbyteStreamBase {
  constructor(
    protected readonly config: GerritConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  protected async gerrit(): Promise<Gerrit> {
    return Gerrit.instance(this.config, this.logger);
  }

  protected projectFilter(): ProjectFilter {
    return ProjectFilter.instance(this.config, this.logger);
  }
}
