import {AirbyteLogger} from 'faros-airbyte-cdk';
import {Repository} from 'faros-airbyte-common/bitbucket';
import {collectReposByOrg} from 'faros-airbyte-common/common';
import {Memoize} from 'typescript-memoize';

import {Bitbucket} from './bitbucket';
import {BitbucketConfig} from './types';

type FilterConfig = {
  workspaces?: Set<string>;
  excludedWorkspaces?: Set<string>;
  reposByWorkspace: Map<string, Set<string>>;
  excludedReposByWorkspace: Map<string, Set<string>>;
};

export class WorkspaceRepoFilter {
  private readonly filterConfig: FilterConfig;
  private workspaces?: Set<string>;
  private reposByWorkspace: Map<string, Map<string, Repository>> = new Map();

  constructor(
    private readonly config: BitbucketConfig,
    private readonly logger: AirbyteLogger
  ) {
    const {workspaces, repositories, excluded_repositories} = this.config;
    let {excluded_workspaces} = this.config;

    if (workspaces?.length && excluded_workspaces?.length) {
      this.logger.warn(
        'Both workspaces and excluded_workspaces are specified, excluded_workspaces will be ignored.'
      );
      excluded_workspaces = undefined;
    }

    const reposByWorkspace = new Map<string, Set<string>>();
    if (repositories?.length) {
      collectReposByOrg(reposByWorkspace, repositories);
    }
    const excludedReposByWorkspace = new Map<string, Set<string>>();
    if (excluded_repositories?.length) {
      collectReposByOrg(excludedReposByWorkspace, excluded_repositories);
    }

    for (const workspace of reposByWorkspace.keys()) {
      if (excludedReposByWorkspace.has(workspace)) {
        this.logger.warn(
          `Both repositories and excluded_repositories are specified for workspace ${workspace}, excluded_repositories for workspace ${workspace} will be ignored.`
        );
        excludedReposByWorkspace.delete(workspace);
      }
    }

    this.filterConfig = {
      workspaces: workspaces?.length ? new Set(workspaces) : undefined,
      excludedWorkspaces: excluded_workspaces?.length
        ? new Set(excluded_workspaces)
        : undefined,
      reposByWorkspace,
      excludedReposByWorkspace,
    };
  }

  @Memoize()
  async getWorkspaces(): Promise<ReadonlyArray<string>> {
    if (!this.workspaces) {
      const workspaces = new Set<string>();
      const bitbucket = Bitbucket.instance(this.config, this.logger);
      const visibleWorkspaces = await bitbucket.getWorkspaceIds();
      if (!visibleWorkspaces.length) {
        this.logger.warn('No visible workspaces found');
      }
      if (!this.filterConfig.workspaces) {
        visibleWorkspaces.forEach((org) => {
          if (!this.filterConfig.excludedWorkspaces?.has(org)) {
            workspaces.add(org);
          }
        });
      } else {
        this.filterConfig.workspaces.forEach((workspace) => {
          if (
            visibleWorkspaces.length &&
            visibleWorkspaces.includes(workspace)
          ) {
            workspaces.add(workspace);
          }
        });
      }
      this.workspaces = workspaces;
    }
    return Array.from(this.workspaces);
  }

  @Memoize()
  async getRepositories(workspace: string): Promise<ReadonlyArray<Repository>> {
    if (!this.reposByWorkspace.has(workspace)) {
      const repos = new Map<string, Repository>();
      const bitbucket = Bitbucket.instance(this.config, this.logger);
      const visibleRepos = await bitbucket.getRepositories(workspace);
      if (!visibleRepos.length) {
        this.logger.warn(
          `No visible repositories found for workspace ${workspace}`
        );
      }
      if (!this.filterConfig.reposByWorkspace.has(workspace)) {
        visibleRepos.forEach((repo) => {
          if (
            !this.filterConfig.excludedReposByWorkspace
              .get(workspace)
              ?.has(repo.name)
          ) {
            repos.set(repo.name, repo);
          }
        });
      } else {
        this.filterConfig.reposByWorkspace
          .get(workspace)
          .forEach((repoName) => {
            const repo = visibleRepos.find((r) => r.name === repoName);
            if (!repo) {
              this.logger.warn(
                `Skipping not found repository ${workspace}/${repoName}`
              );
              return;
            }
            repos.set(repo.name, repo);
          });
      }
      this.reposByWorkspace.set(workspace, repos);
    }
    return Array.from(this.reposByWorkspace.get(workspace).values());
  }
}
