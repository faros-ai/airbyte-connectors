import {StreamKey} from 'faros-airbyte-cdk';
import {CopilotSeat} from 'faros-airbyte-common/github';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {StreamBase} from './common';

export class FarosCopilotSeats extends StreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosCopilotSeats.json');
  }

  get primaryKey(): StreamKey {
    return ['org', 'user'];
  }

  async *readRecords(): AsyncGenerator<CopilotSeat> {
    const github = await GitHub.instance(this.config, this.logger);
    const org = ''; // todo: get from slice or github instance should fetch from all orgs based on cfg?
    yield* github.getCopilotSeats(org);
  }
}
