import {AirbyteLogger, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {BitbucketServerConfig, WorkspaceUser} from '../bitbucket-server/types';
import {StreamBase} from './common';

type StreamSlice = {project: string};

export class WorkspaceUsers extends StreamBase {
  constructor(
    readonly config: BitbucketServerConfig,
    readonly logger: AirbyteLogger
  ) {
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
    yield* this.server.workspaceUsers(streamSlice.project);
  }
}
