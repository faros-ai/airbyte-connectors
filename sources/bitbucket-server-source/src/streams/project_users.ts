import {AirbyteLogger, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {ProjectUser} from 'faros-airbyte-common/bitbucket-server';
import {Dictionary} from 'ts-essentials';

import {BitbucketServerConfig} from '../bitbucket-server';
import {StreamBase} from './common';

type StreamSlice = {project: string};

export class ProjectUsers extends StreamBase {
  constructor(
    readonly config: BitbucketServerConfig,
    readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any> {
    return require('../../resources/schemas/project_users.json');
  }

  get primaryKey(): StreamKey {
    return ['user', 'slug'];
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
