import {StreamKey} from 'faros-airbyte-cdk';
import {Team} from 'faros-airbyte-common/jira';
import {Dictionary} from 'ts-essentials';

import {Jira} from '../jira';
import {StreamBase} from './common';

export class FarosTeams extends StreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosUsers.json');
  }

  get primaryKey(): StreamKey {
    return ['id', 'userId'];
  }

  async *readRecords(): AsyncGenerator<Team> {
    const jira = await Jira.instance(this.config, this.logger);
    for await (const team of jira.getTeams(this.config.organization_id)) {
      yield team;
    }
  }
}
