import {StreamKey} from 'faros-airbyte-cdk';
import {Team} from 'faros-airbyte-common/jira';
import {Dictionary} from 'ts-essentials';

import {Jira} from '../jira';
import {StreamBase} from './common';

export class FarosTeams extends StreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosTeams.json');
  }

  get primaryKey(): StreamKey {
    return ['id'];
  }

  async *readRecords(): AsyncGenerator<Team> {
    const jira = await Jira.instance(this.config, this.logger);
    for (const team of await jira.getTeams()) {
      yield team;
    }
  }
}
