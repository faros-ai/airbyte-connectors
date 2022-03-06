import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Docker, DockerConfig, Tag} from '../docker';

type StreamSlice = {repository: string} | undefined;

export class Tags extends AirbyteStreamBase {
  constructor(
    private readonly config: DockerConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/tags.json');
  }
  get primaryKey(): StreamKey {
    return 'name';
  }

  async *streamSlices(
    syncMode: SyncMode,
    cursorField?: string[],
    streamState?: Dictionary<any>
  ): AsyncGenerator<StreamSlice> {
    for (const repository of this.config.repositories) {
      yield {repository};
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: Dictionary<any>
  ): AsyncGenerator<Tag> {
    const repo = streamSlice.repository;
    const config: DockerConfig = {
      ...this.config,
      projectName: repo,
    };
    const docker = await Docker.instance(config, this.logger);
    yield* docker.getTags(repo);
  }
}
