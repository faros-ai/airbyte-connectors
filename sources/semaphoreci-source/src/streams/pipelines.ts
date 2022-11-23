import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Pipeline} from '../semaphoreci/models';
import {SemaphoreCI, SemaphoreCIConfig} from '../semaphoreci/semaphoreci';
import {Projects} from './projects';

type StreamSlice =
  | {
      projectId: string;
      branchName?: string;
    }
  | undefined;

interface PipelineState {
  [key: string]: {
    lastCreatedAt: string;
  };
}
export class Pipelines extends AirbyteStreamBase {
  constructor(
    private readonly config: SemaphoreCIConfig,
    protected readonly logger: AirbyteLogger,
    protected readonly projects: Projects
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/pipelines.json');
  }
  get primaryKey(): StreamKey {
    return 'ppl_id';
  }

  get cursorField(): string {
    return 'created_at';
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    const semaphore = SemaphoreCI.instance(this.config, this.logger);
    const projects = this.projects.readRecords();
    const branches = semaphore.branchNames;

    for await (const project of projects) {
      if (branches?.length) {
        for (const branch of branches) {
          yield {
            projectId: project.metadata.id,
            branchName: branch,
          };
        }
      } else {
        yield {projectId: project.metadata.id};
      }
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: PipelineState
  ): AsyncGenerator<Dictionary<any, string>, any, unknown> {
    const lastCreatedAt =
      syncMode === SyncMode.INCREMENTAL
        ? streamState && streamState[streamSlice?.projectId]?.lastCreatedAt
        : undefined;

    const semaphoreci = SemaphoreCI.instance(this.config, this.logger);

    yield* semaphoreci.getPipelines(
      streamSlice.projectId,
      streamSlice.branchName,
      lastCreatedAt
    );
  }

  getUpdatedState(
    currentStreamState: PipelineState,
    latestRecord: Pipeline
  ): PipelineState {
    const lastCreatedAt: Date = new Date(latestRecord.created_at);
    const currentLastCreatedAt: Date = new Date(
      currentStreamState[latestRecord.project_id]?.lastCreatedAt || 0
    );

    return {
      ...currentStreamState,
      [latestRecord.project_id]: {
        lastCreatedAt:
          lastCreatedAt >= currentLastCreatedAt
            ? latestRecord.created_at
            : currentStreamState[latestRecord.project_id].lastCreatedAt,
      },
    };
  }
}
