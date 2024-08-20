import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Repository} from 'faros-airbyte-common/bitbucket';
import {Dictionary} from 'ts-essentials';

import {Bitbucket} from '../bitbucket';
import {StreamWithWorkspaceSlices, WorkspaceStreamSlice} from './common';

export class Repositories extends StreamWithWorkspaceSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/repositories.json');
  }
  get primaryKey(): StreamKey {
    return ['uuid'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: WorkspaceStreamSlice
  ): AsyncGenerator<Repository> {
    const bitbucket = Bitbucket.instance(this.config, this.logger);
    for (const repo of await bitbucket.getRepositories(streamSlice.workspace)) {
      yield repo;
    }
  }
}
