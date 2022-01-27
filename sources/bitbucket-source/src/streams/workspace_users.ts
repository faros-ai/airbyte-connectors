import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Bitbucket} from '../bitbucket/bitbucket';
import {BitbucketConfig, WorkspaceUser} from '../bitbucket/types';

export class WorkspaceUsers extends AirbyteStreamBase {
  constructor(readonly config: BitbucketConfig, logger: AirbyteLogger) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any> {
    return require('../../resources/schemas/workspace_users.json');
  }
  get primaryKey(): StreamKey {
    return ['user', 'uuid'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: Dictionary<any>
  ): AsyncGenerator<WorkspaceUser> {
    const bitbucket = Bitbucket.instance(this.config, this.logger);

    yield* bitbucket.getWorkspaceUsers();
  }
}
