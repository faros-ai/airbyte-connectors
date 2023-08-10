import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Service} from '../models';
import {Squadcast, SquadcastConfig} from '../squadcast';

export class Services extends AirbyteStreamBase {
  constructor(
    private readonly config: SquadcastConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/services.json');
  }
  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(): AsyncGenerator<Service> {
    const squadcast = await Squadcast.instance(this.config, this.logger);
    for (const service of await squadcast.getServices()) {
      yield service;
    }
  }
}
