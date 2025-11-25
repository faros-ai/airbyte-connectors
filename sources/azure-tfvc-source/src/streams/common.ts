import {TeamProject} from 'azure-devops-node-api/interfaces/CoreInterfaces';
import {
  AirbyteLogger,
  AirbyteStreamBase,
  calculateUpdatedStreamState,
  SyncMode,
} from 'faros-airbyte-cdk';

import {AzureTfvc} from '../azure-tfvc';
import {AzureTfvcConfig} from '../models';

export interface ProjectStreamSlice {
  project: TeamProject;
  organization: string;
}

export interface ProjectStreamState {
  [projectName: string]: {
    cutoff: number;
  };
}

export abstract class AzureTfvcStreamBase extends AirbyteStreamBase {
  constructor(
    protected readonly config: AzureTfvcConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }
}

export abstract class StreamWithProjectSlices extends AzureTfvcStreamBase {
  async *streamSlices(): AsyncGenerator<ProjectStreamSlice> {
    const tfvc = await AzureTfvc.instance(
      this.config,
      this.logger,
      this.config.include_changes ?? true
    );

    for (const project of await tfvc.getProjects(this.config.projects)) {
      yield {project, organization: this.config.organization};
    }
  }

  protected getCutoff(
    syncMode: SyncMode,
    streamSlice: ProjectStreamSlice,
    streamState: ProjectStreamState
  ): string | undefined {
    if (syncMode === SyncMode.FULL_REFRESH) {
      return undefined;
    }

    const projectName = streamSlice.project.name;
    const cutoff = streamState?.[projectName]?.cutoff;
    return cutoff ? new Date(cutoff).toISOString() : undefined;
  }

  protected updateState(
    currentStreamState: ProjectStreamState,
    projectName: string,
    recordDate: Date
  ): ProjectStreamState {
    return calculateUpdatedStreamState(
      recordDate,
      currentStreamState,
      projectName
    );
  }
}
