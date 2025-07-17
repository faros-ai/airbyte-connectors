import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {FireHydrant, FireHydrantConfig} from '../firehydrant/firehydrant';
import {Team} from '../firehydrant/models';
export class Teams extends AirbyteStreamBase {
  constructor(
    private readonly config: FireHydrantConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/teams.json');
  }
  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(): AsyncGenerator<Team> {
    const firehydrant = FireHydrant.instance(this.config, this.logger);
    yield* firehydrant.getTeams();
  }
}
