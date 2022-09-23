import {AirbyteLogger, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Repository} from 'faros-airbyte-common/bitbucket-server';
import {Dictionary} from 'ts-essentials';

import {BitbucketServerConfig} from '../bitbucket-server';
import {StreamBase} from './common';

type StreamSlice = {project: string};

export class Repositories extends StreamBase {
  constructor(
    readonly config: BitbucketServerConfig,
    readonly logger: AirbyteLogger
  ) {
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
    for (const repo of await this.server.repositories(
      streamSlice.project,
      this.config.repositories
    )) {
      yield repo;
    }
  }
}
