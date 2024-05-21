import {StreamKey} from 'faros-airbyte-cdk';
import {User} from 'faros-airbyte-common/jira';
import {Dictionary} from 'ts-essentials';

import {Jira} from '../jira';
import {StreamBase} from './common';

export class FarosUsers extends StreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosUsers.json');
  }

  get primaryKey(): StreamKey {
    return ['id'];
  }

  async *readRecords(): AsyncGenerator<User> {
    const jira = await Jira.instance(this.config, this.logger);
    for await (const user of jira.getUsers()) {
      this.logger.info('Fetching users');
      this.logger.info('User data: ' + JSON.stringify(user));
      yield {
        id: user.accountId ?? user.key,
        ...user,
      };
    }
  }
}
