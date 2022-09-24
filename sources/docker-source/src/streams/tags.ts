import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Docker, DockerConfig, Tag} from '../docker';

type StreamSlice = {repository: string} | undefined;

interface TagState {
  lastCreatedAt: string;
}

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
  get cursorField(): string | string[] {
    return ['imageConfig', 'created'];
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
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
    const lastCreatedAt =
      syncMode === SyncMode.INCREMENTAL && streamState?.lastCreatedAt
        ? new Date(streamState.lastCreatedAt)
        : undefined;
    for (const tag of await docker.getTags(repo, lastCreatedAt)) {
      yield tag;
    }
  }

  getUpdatedState(currentStreamState: TagState, latestRecord: Tag): TagState {
    const createdAt = new Date(latestRecord.imageConfig.created);
    return {
      lastCreatedAt:
        createdAt > new Date(currentStreamState?.lastCreatedAt ?? 0)
          ? createdAt.toISOString()
          : currentStreamState?.lastCreatedAt,
    };
  }
}
