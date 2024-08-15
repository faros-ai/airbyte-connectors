import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Bitbucket} from '../bitbucket';
import {BitbucketConfig, Repository} from '../types';

type StreamSlice = {workspace: string};

export class Repositories extends AirbyteStreamBase {
  constructor(
    readonly config: BitbucketConfig,
    readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/repositories.json');
  }
  get primaryKey(): StreamKey {
    return ['uuid'];
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    for (const workspace of this.config.workspaces) {
      yield {workspace};
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice
  ): AsyncGenerator<Repository> {
    const bitbucket = Bitbucket.instance(this.config, this.logger);
    for (const repo of await bitbucket.getRepositories(streamSlice.workspace)) {
      yield repo;
    }
  }
}
