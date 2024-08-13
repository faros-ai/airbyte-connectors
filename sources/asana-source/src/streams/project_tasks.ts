import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Asana, AsanaConfig} from '../asana';
import {ProjectTaskAssociation} from '../models';
import {ProjectTasksState} from './common';

type StreamSlice = {
  project: string;
};

export class ProjectTasks extends AirbyteStreamBase {
  private readonly lastComputedAt = Date.now();

  constructor(
    private readonly config: AsanaConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/project_tasks.json');
  }

  get primaryKey(): StreamKey {
    return ['project_gid', 'task_gid'];
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    const asana = Asana.instance(this.config, this.logger);

    for (const workspace of await asana.getWorkspaces()) {
      for await (const project of asana.getProjects(
        workspace.gid,
        this.logger
      )) {
        yield {project: project.gid};
      }
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice
  ): AsyncGenerator<ProjectTaskAssociation> {
    const asana = Asana.instance(this.config, this.logger);

    yield* asana.getProjectTasks(streamSlice.project, this.logger);
  }

  getUpdatedState(): ProjectTasksState {
    return {
      lastComputedAt: this.lastComputedAt,
    };
  }
}
