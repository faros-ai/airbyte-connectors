import {AirbyteLogger, AirbyteStreamBase} from 'faros-airbyte-cdk';

import {Statuspage, StatuspageConfig} from '../statuspage';

export abstract class StatuspageStreamBase extends AirbyteStreamBase {
  protected statuspage: Statuspage;

  constructor(
    protected readonly cfg: StatuspageConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
    this.statuspage = Statuspage.instance(cfg, logger);
  }
}
