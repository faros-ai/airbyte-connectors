import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Gitlab, GitlabConfig, Pipeline} from '../gitlab';
import {Projects} from './projects';

type StreamSlice = {projectPath?: string} | undefined;

export class Pipelines extends AirbyteStreamBase {
  constructor(
    readonly config: GitlabConfig,
    readonly gitlab: Gitlab,
    readonly projects: Projects,
    readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/pipelines.json');
  }

  get primaryKey(): StreamKey {
    return ['id', 'iid'];
  }

  get cursorField(): string | string[] {
    return 'updatedAt';
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    const projects = this.projects.readRecords();
    for await (const project of projects) {
      yield {projectPath: project.pathWithNamespace};
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<Pipeline> {
    const cutoff = streamState?.cutoff;
    if (cutoff > Date.now()) {
      this.logger.info(`Last cutoff ${cutoff} is greater than current time`);
      return;
    }
    const lastUpdated = syncMode === SyncMode.INCREMENTAL ? cutoff : undefined;

    yield* this.gitlab.getPipelines(streamSlice.projectPath, lastUpdated);
  }

  getUpdatedState(
    currentStreamState: Dictionary<any>,
    latestRecord: Pipeline
  ): Dictionary<any> {
    return {
      cutoff:
        new Date(latestRecord.updatedAt) >
        new Date(currentStreamState?.cutoff ?? 0)
          ? latestRecord.updatedAt
          : currentStreamState.cutoff,
    };
  }
}
