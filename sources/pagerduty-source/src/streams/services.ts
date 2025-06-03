import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Pagerduty, PagerdutyConfig} from '../pagerduty';

export class Services extends AirbyteStreamBase {
  constructor(
    readonly config: PagerdutyConfig,
    logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/services.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(): AsyncGenerator<Dictionary<any, string>, any, unknown> {
    const pagerduty = Pagerduty.instance(this.config, this.logger);
    yield* pagerduty.getServices(this.config.service_details);
  }
}
