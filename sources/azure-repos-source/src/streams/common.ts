import {GitRepository} from 'azure-devops-node-api/interfaces/GitInterfaces';
import {AirbyteLogger, AirbyteStreamBase, SyncMode} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {AzureRepos} from '../azure-repos';
import {AzureReposConfig} from '../models';

export interface BranchStreamSlice {
  repository: GitRepository;
  branch: string;
}

export interface BranchStreamState {
  [projectName: string]: {
    [repoName: string]: {
      [branch: string]: {
        cutoff: string;
      };
    };
  };
}

export interface RepoStreamSlice {
  repository: GitRepository;
}

export interface RepoStreamState {
  [projectName: string]: {
    [repoName: string]: {
      cutoff: string;
    };
  };
}

export abstract class AzureReposStreamBase extends AirbyteStreamBase {
  constructor(
    protected readonly config: AzureReposConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }
}

export abstract class StreamWithBranchSlices extends AzureReposStreamBase {
  async *streamSlices(): AsyncGenerator<BranchStreamSlice> {
    const azureRepos = await AzureRepos.instance(
      this.config,
      this.logger,
      this.config.branch_pattern,
      this.config.repositories,
      this.config.fetch_tags,
      this.config.fetch_branch_commits
    );

    for (const project of await azureRepos.getProjects(this.config?.projects)) {
      for (const repository of await azureRepos.listRepositories({
        id: project.id,
        name: project.name,
      })) {
        if (repository.isDisabled) {
          this.logger.info(
            `Repository ${repository.name}:${repository.id} in project ` +
              `${project.name} is disabled, skipping`
          );
          continue;
        }

        const branchNames = await azureRepos.getBranchNamesToQuery(repository);
        for (const branch of branchNames) {
          yield {
            branch,
            repository: {
              id: repository.id,
              name: repository.name,
              defaultBranch: repository.defaultBranch,
              project: {
                id: project.id,
                name: project.name,
              },
            },
          };
        }
      }
    }
  }

  protected getCutoff(
    syncMode: SyncMode,
    streamSlice: BranchStreamSlice,
    streamState: BranchStreamState
  ): string | undefined {
    if (syncMode === SyncMode.FULL_REFRESH) {
      return undefined;
    }

    const project = streamSlice.repository.project.name;
    const repository = streamSlice.repository.name;
    const branch = streamSlice.branch;

    return streamState?.[project]?.[repository]?.[branch]?.cutoff;
  }

  protected updateState(
    currentStreamState: BranchStreamState,
    branch: string,
    repository: string,
    project: string,
    recordDate: Date
  ): BranchStreamState {
    const currentState = Utils.toDate(
      currentStreamState?.[project]?.[repository]?.[branch]?.cutoff ?? 0
    );
    const newState = recordDate > currentState ? recordDate : currentState;
    return {
      ...currentStreamState,
      [project]: {
        [repository]: {
          [branch]: {cutoff: newState.toISOString()},
        },
      },
    };
  }
}

export abstract class StreamWithRepoSlices extends AzureReposStreamBase {
  async *streamSlices(): AsyncGenerator<RepoStreamSlice> {
    const azureRepos = await AzureRepos.instance(
      this.config,
      this.logger,
      this.config.branch_pattern,
      this.config.repositories,
      this.config.fetch_tags,
      this.config.fetch_branch_commits
    );

    for (const project of await azureRepos.getProjects(this.config?.projects)) {
      for (const repository of await azureRepos.listRepositories({
        id: project.id,
        name: project.name,
      })) {
        if (repository.isDisabled) {
          this.logger.info(
            `Repository ${repository.name}:${repository.id} in project ` +
              `${project.name} is disabled, skipping`
          );
          continue;
        }

        yield {
          repository: {
            id: repository.id,
            name: repository.name,
            defaultBranch: repository.defaultBranch,
            project: {
              id: project.id,
              name: project.name,
            },
          },
        };
      }
    }
  }

  protected getCutoff(
    syncMode: SyncMode,
    streamSlice: RepoStreamSlice,
    streamState: RepoStreamState
  ): string | undefined {
    if (syncMode === SyncMode.FULL_REFRESH) {
      return undefined;
    }

    const project = streamSlice.repository.project.name;
    const repository = streamSlice.repository.name;

    return streamState?.[project]?.[repository]?.cutoff;
  }

  protected updateState(
    currentStreamState: RepoStreamState,
    repository: string,
    project: string,
    recordDate: Date
  ): RepoStreamState {
    const currentState = Utils.toDate(
      currentStreamState?.[project]?.[repository]?.cutoff ?? 0
    );
    const newState = recordDate > currentState ? recordDate : currentState;
    return {
      ...currentStreamState,
      [project]: {
        ...currentStreamState?.[project],
        [repository]: {cutoff: newState.toISOString()},
      },
    };
  }
}
