import {TeamProject} from 'azure-devops-node-api/interfaces/CoreInterfaces';
import {TfvcBranch} from 'azure-devops-node-api/interfaces/TfvcInterfaces';
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
      this.config.include_changes,
      this.config.include_work_items,
      this.config.branch_pattern
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

export interface BranchStreamSlice {
  project: TeamProject;
  branch?: TfvcBranch;
  organization: string;
}

export interface BranchStreamState {
  [projectName: string]: {
    [branchPath: string]: {
      cutoff: number;
    };
  };
}

export abstract class StreamWithBranchSlices extends AzureTfvcStreamBase {
  async *streamSlices(): AsyncGenerator<BranchStreamSlice> {
    const tfvc = await AzureTfvc.instance(
      this.config,
      this.logger,
      this.config.include_changes,
      this.config.include_work_items,
      this.config.branch_pattern
    );

    for (const project of await tfvc.getProjects(this.config.projects)) {
      const branches = await tfvc.getBranches(project.id);

      this.logger.info(
        `Project ${project.name}: ${branches.length} branches found` +
          (this.config.branch_pattern
            ? ` matching pattern ${this.config.branch_pattern}`
            : '')
      );

      if (branches.length === 0) {
        // No formal branches - fetch changesets at project level
        yield {project, organization: this.config.organization};
      } else {
        for (const branch of branches) {
          yield {project, branch, organization: this.config.organization};
        }
      }
    }
  }

  protected getBranchCutoff(
    syncMode: SyncMode,
    streamSlice: BranchStreamSlice,
    streamState: BranchStreamState
  ): string | undefined {
    if (syncMode === SyncMode.FULL_REFRESH) {
      return undefined;
    }

    const projectName = streamSlice.project.name;
    const branchKey = streamSlice.branch?.path ?? '__project__';
    const cutoff = streamState?.[projectName]?.[branchKey]?.cutoff;
    return cutoff ? new Date(cutoff).toISOString() : undefined;
  }

  protected updateBranchState(
    currentStreamState: BranchStreamState,
    projectName: string,
    branchPath: string | undefined,
    recordDate: Date
  ): BranchStreamState {
    const branchKey = branchPath ?? '__project__';
    const projectState = currentStreamState?.[projectName] ?? {};
    const updatedProjectState = calculateUpdatedStreamState(
      recordDate,
      projectState,
      branchKey
    );
    return {
      ...currentStreamState,
      [projectName]: updatedProjectState,
    };
  }
}
