import {StreamKey} from 'faros-airbyte-cdk';
import {Workspace} from 'faros-airbyte-common/clickup';
import {Dictionary} from 'ts-essentials';

import {StreamBase} from './common';

export class Workspaces extends StreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/workspaces.json');
  }

  get primaryKey(): StreamKey {
    return ['id'];
  }

  async *readRecords(): AsyncGenerator<Workspace> {
    for (const workspace of await this.clickup.workspaces(
      this.cfg.workspaces
    )) {
      yield workspace;
    }
  }
}
