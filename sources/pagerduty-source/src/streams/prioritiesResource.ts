import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Pagerduty, PagerdutyConfig, Priority} from '../pagerduty';

export class PrioritiesResource extends AirbyteStreamBase {
  constructor(
    readonly config: PagerdutyConfig,
    logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/prioritiesResource.json');
  }
  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(): AsyncGenerator<Priority> {
    const pagerduty = Pagerduty.instance(this.config, this.logger);
    yield* pagerduty.getPrioritiesResource();
  }
}
