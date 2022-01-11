import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Bitbucket} from '../bitbucket/bitbucket';
import {BitbucketConfig, Deployment} from '../bitbucket/types';

type StreamSlice = {repository?: string} | undefined;

export class Deployments extends AirbyteStreamBase {
  constructor(
    readonly config: BitbucketConfig,
    readonly repositories: string[],
    readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/deployments.json');
  }
  get primaryKey(): StreamKey {
    return 'uuid';
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
    streamState?: Dictionary<any>
  ): AsyncGenerator<Deployment> {
    const bitbucket = Bitbucket.instance(this.config, this.logger);

    const repoSlug = streamSlice.repository;
    yield* bitbucket.getDeployments(repoSlug);
  }
}
