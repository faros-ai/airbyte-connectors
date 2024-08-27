import {StreamKey} from 'faros-airbyte-cdk';
import {Workspace} from 'faros-airbyte-common/bitbucket';
import {Dictionary} from 'ts-essentials';

import {Bitbucket} from '../bitbucket';
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
    const workspaces = await this.workspaceRepoFilter.getWorkspaces();
    for (const workspace of workspaces) {
      yield bitbucket.getWorkspace(workspace);
    }
  }
}
