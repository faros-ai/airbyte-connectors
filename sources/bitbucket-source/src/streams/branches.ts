import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Bitbucket} from '../bitbucket/bitbucket';
import {BitbucketConfig, Branch} from '../bitbucket/types';

type StreamSlice = {repository?: string} | undefined;

export class Branches extends AirbyteStreamBase {
  constructor(
    readonly config: BitbucketConfig,
    readonly repositories: string[],
    readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/branches.json');
  }
  get primaryKey(): StreamKey {
    return 'name';
  }

  async *streamSlices(
    syncMode: SyncMode,
    cursorField?: string[],
    streamState?: Dictionary<any>
  ): AsyncGenerator<StreamSlice> {
    for (const repository of this.repositories) {
      yield {repository};
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<Branch> {
    const bitbucket = Bitbucket.instance(this.config, this.logger);

    const repoSlug = streamSlice.repository;
    yield* bitbucket.getBranches(repoSlug);
  }
}
