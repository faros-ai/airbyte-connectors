import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Event} from '../models';
import {Squadcast, SquadcastConfig} from '../squadcast';

export class Events extends AirbyteStreamBase {
  constructor(
    private readonly config: SquadcastConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/events.json');
  }
  get primaryKey(): StreamKey {
    return 'alert_source_id';
  }

  async *readRecords(): AsyncGenerator<Event> {
    const squadcast = await Squadcast.instance(this.config, this.logger);
    yield* squadcast.getEvents();
  }
}
