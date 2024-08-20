import {StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Bitbucket} from '../bitbucket';
import {Workspace} from '../types';
import {StreamBase} from './common';

export class Workspaces extends StreamBase {
  getJsonSchema(): Dictionary<any> {
    return require('../../resources/schemas/workspaces.json');
  }
  get primaryKey(): StreamKey {
    return ['uuid'];
  }

  async *readRecords(): AsyncGenerator<Workspace> {
    const bitbucket = Bitbucket.instance(this.config, this.logger);

    yield* bitbucket.getWorkspaces();
  }
}
