import {AirbyteLogger, AirbyteStreamBase, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {GerritClient, GerritProject} from '../gerrit';
import {GerritConfig, ProjectsStreamState} from '../types';

export class FarosProjects extends AirbyteStreamBase {
  constructor(
    private readonly config: GerritConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosProjects.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  get cursorField(): string | string[] {
    return 'name';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: any,
    streamState?: ProjectsStreamState
  ): AsyncGenerator<GerritProject> {
    const client = new GerritClient(this.config, this.logger);
    const lastProject = streamState?.lastProject;
    let foundLastProject = !lastProject;

    for await (const projectBatch of client.listProjects({skip: lastProject})) {
      for (const project of projectBatch) {
        // If we're starting from a saved state, skip until we find the last project
        if (!foundLastProject) {
          if (project.id === lastProject) {
            foundLastProject = true;
          }
          continue;
        }

        // Apply project filters if configured
        if (this.config.projects?.length) {
          if (!this.config.projects.includes(project.name)) {
            continue;
          }
        }

        yield project;
      }
    }
  }

  getUpdatedState(
    currentStreamState: ProjectsStreamState,
    latestRecord: GerritProject
  ): ProjectsStreamState {
    return {
      lastProject: latestRecord.id,
    };
  }
}