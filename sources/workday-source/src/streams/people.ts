import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {WorkdayConfig} from '..';
import {Person} from '../types';
import {Workday} from '../workday';

export class People extends AirbyteStreamBase {
  constructor(
    private readonly cfg: WorkdayConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/people.json');
  }
  get primaryKey(): StreamKey {
    return ['id'];
  }

  async *readRecords(): AsyncGenerator<Person> {
    const workday = await Workday.instance(this.cfg, this.logger);
    yield* workday.people();
  }
}
