import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Team, Victorops, VictoropsConfig} from '../victorops';

export class Teams extends AirbyteStreamBase {
  constructor(
    readonly config: VictoropsConfig,
    logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/teams.json');
  }
  get primaryKey(): StreamKey {
    return 'slug';
  }

  async *readRecords(): AsyncGenerator<Team> {
    yield* Victorops.instance(this.config, this.logger).getTeams();
  }
}
