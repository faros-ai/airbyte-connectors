import {AirbyteLogger, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {BitbucketServerConfig, Repository} from '../bitbucket-server/types';
import {StreamBase} from './common';

type StreamSlice = {project: string};

export class Repositories extends StreamBase {
  constructor(readonly config: BitbucketServerConfig, logger: AirbyteLogger) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any> {
    return require('../../resources/schemas/repositories.json');
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
  ): AsyncGenerator<Repository> {
    const repos = await this.server.repositories(streamSlice.project);
    for (const repo of repos) {
      yield repo;
    }
  }
}
