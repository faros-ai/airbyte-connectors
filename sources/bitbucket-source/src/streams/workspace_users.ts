import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Bitbucket} from '../bitbucket';
import {WorkspaceUser} from '../types';
import {StreamWithWorkspaceSlices, WorkspaceStreamSlice} from './common';

export class WorkspaceUsers extends StreamWithWorkspaceSlices {
  getJsonSchema(): Dictionary<any> {
    return require('../../resources/schemas/workspace_users.json');
  }
  get primaryKey(): StreamKey {
    return ['user', 'uuid'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: WorkspaceStreamSlice
  ): AsyncGenerator<WorkspaceUser> {
    const bitbucket = Bitbucket.instance(this.config, this.logger);

    yield* bitbucket.getWorkspaceUsers(streamSlice.workspace);
  }
}
