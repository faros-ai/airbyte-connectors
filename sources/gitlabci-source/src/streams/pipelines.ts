import {AirbyteStreamBase, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {AirbyteLogger} from 'faros-airbyte-cdk/lib';
import {Dictionary} from 'ts-essentials';

import {Gitlab, GitlabConfig, Pipeline} from '../gitlab';
import {Projects} from './projects';

type StreamSlice = {projectPath?: string} | undefined;

export class Pipelines extends AirbyteStreamBase {
  constructor(
    readonly config: GitlabConfig,
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

  async *streamSlices(
    syncMode: SyncMode,
    cursorField?: string[],
    streamState?: Dictionary<any>
  ): AsyncGenerator<StreamSlice> {
    const projects = this.projects.readRecords(SyncMode.FULL_REFRESH);
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
    const gitlab = Gitlab.instance(this.config, this.logger);

    yield* gitlab.getPipelines(streamSlice.projectPath);
  }
}
