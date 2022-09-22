import {AirbyteLogger, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Project} from 'faros-airbyte-common/lib/bitbucket-server/types';
import {Dictionary} from 'ts-essentials';

import {Config} from '../bitbucket-server';
import {StreamBase} from './common';

type StreamSlice = {project: string};

export class Projects extends StreamBase {
  constructor(readonly config: Config, readonly logger: AirbyteLogger) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any> {
    return require('../../resources/schemas/projects.json');
  }

  get primaryKey(): StreamKey {
    return 'slug';
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
  ): AsyncGenerator<Project> {
    yield this.server.project(streamSlice.project);
  }
}
