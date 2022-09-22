import {AirbyteLogger, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {ProjectUser} from 'faros-airbyte-common/lib/bitbucket-server/types';
import {Dictionary} from 'ts-essentials';

import {Config} from '../bitbucket-server';
import {StreamBase} from './common';

type StreamSlice = {project: string};

export class ProjectUsers extends StreamBase {
  constructor(readonly config: Config, readonly logger: AirbyteLogger) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any> {
    return require('../../resources/schemas/project_users.json');
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
  ): AsyncGenerator<ProjectUser> {
    yield* this.server.projectUsers(streamSlice.project);
  }
}
