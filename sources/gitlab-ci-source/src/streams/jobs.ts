import {AirbyteStreamBase, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {AirbyteLogger} from 'faros-airbyte-cdk/lib';
import {Dictionary} from 'ts-essentials';

import {Gitlab, GitlabConfig, Job} from '../gitlab';
import {Pipelines} from './pipelines';
import {Projects} from './projects';

type StreamSlice = {projectPath?: string; pipelineId?: number} | undefined;

export class Jobs extends AirbyteStreamBase {
  constructor(
    readonly config: GitlabConfig,
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

  async *streamSlices(
    syncMode: SyncMode,
    cursorField?: string[],
    streamState?: Dictionary<any>
  ): AsyncGenerator<StreamSlice> {
    const projects = this.projects.readRecords(SyncMode.FULL_REFRESH);

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
    streamSlice?: StreamSlice,
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<Job> {
    const gitlab = Gitlab.instance(this.config, this.logger);

    yield* gitlab.getJobs(streamSlice.projectPath, streamSlice.pipelineId);
  }
}
