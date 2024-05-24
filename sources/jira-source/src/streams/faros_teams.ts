import {StreamKey} from 'faros-airbyte-cdk';
import {Team, User} from 'faros-airbyte-common/jira';
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
    this.logger.info('Fetching users for writing teams');
    for await (const user of jira.getUsers()) {
      if (user.accountId) {
        this.logger.info(`Fetching teams for user ${user.accountId}`);
        for await (const team of await jira.getTeamsForUser(user.accountId)) {
          yield {
            ...team,
            userId: user.accountId,
          };
        }
      }
    }
  }
}
