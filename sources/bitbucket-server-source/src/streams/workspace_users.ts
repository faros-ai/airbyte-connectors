import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {BitbucketServer} from '../bitbucket-server/bitbucket-server';
import {BitbucketServerConfig, WorkspaceUser} from '../bitbucket-server/types';

type StreamSlice = {project: string};

export class WorkspaceUsers extends AirbyteStreamBase {
  constructor(readonly config: BitbucketServerConfig, logger: AirbyteLogger) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any> {
    return require('../../resources/schemas/workspace_users.json');
  }

  get primaryKey(): StreamKey {
    return ['user', 'accountId'];
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    for (const project of this.config.projects) {
      yield {project};
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice
  ): AsyncGenerator<WorkspaceUser> {
    yield* BitbucketServer.instance(this.config, this.logger).workspaceUsers(
      streamSlice.project
    );
  }
}
