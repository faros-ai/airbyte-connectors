import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Gitlab, GitlabConfig, Job} from '../gitlab';
import {Pipelines} from './pipelines';
import {Projects} from './projects';

type StreamSlice = {projectPath?: string; pipelineId?: number} | undefined;

export class Jobs extends AirbyteStreamBase {
  constructor(
    readonly config: GitlabConfig,
    readonly gitlab: Gitlab,
    readonly projects: Projects,
    readonly pipelines: Pipelines,
    readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/jobs.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    const projects = this.projects.readRecords();

    for await (const project of projects) {
      const projectPath = project.pathWithNamespace;
      const pipelines = this.pipelines.readRecords(
        SyncMode.INCREMENTAL,
        undefined,
        {projectPath}
      );
      for await (const pipeline of pipelines) {
        yield {projectPath, pipelineId: pipeline.id};
      }
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice
  ): AsyncGenerator<Job> {
    yield* this.gitlab.getJobs(streamSlice.projectPath, streamSlice.pipelineId);
  }
}
