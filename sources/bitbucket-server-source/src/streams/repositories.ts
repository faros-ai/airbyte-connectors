import {AirbyteLogger, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Repository} from 'faros-airbyte-common/bitbucket-server';
import {Dictionary} from 'ts-essentials';

import {BitbucketServerConfig} from '../bitbucket-server';
import {StreamBase} from './common';

type StreamSlice = {projectKey: string};

export class Repositories extends StreamBase {
  constructor(
    readonly config: BitbucketServerConfig,
    readonly logger: AirbyteLogger
  ) {
    super(config, logger);
  }

  getJsonSchema(): Dictionary<any> {
    return require('../../resources/schemas/repositories.json');
  }

  get primaryKey(): StreamKey {
    return 'slug';
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    for await (const project of this.projects()) {
      const projectKey = await this.fetchProjectKey(project.key);
      yield {projectKey};
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice
  ): AsyncGenerator<Repository> {
    for (const repo of await this.server.repositories(
      streamSlice.projectKey,
      this.projectRepoFilter
    )) {
      yield repo;
    }
  }
}
