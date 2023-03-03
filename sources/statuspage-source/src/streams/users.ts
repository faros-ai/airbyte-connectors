import {StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {User} from '../types';
import {StatuspageStreamBase} from './common';

export class Users extends StatuspageStreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/users.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(): AsyncGenerator<User> {
    yield* this.statuspage.getUsers(this.cfg.org_id);
  }
}
