import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {BitbucketServer} from '../bitbucket-server/bitbucket-server';
import {BitbucketServerConfig, Repository} from '../bitbucket-server/types';

type StreamSlice = {project: string};

export class Repositories extends AirbyteStreamBase {
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
    yield* BitbucketServer.instance(this.config, this.logger).repositories(
      streamSlice.project
    );
  }
}
