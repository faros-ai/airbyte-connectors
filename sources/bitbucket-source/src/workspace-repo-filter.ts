import {AirbyteLogger} from 'faros-airbyte-cdk';

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
  private reposByWorkspace: Map<string, Set<string>> = new Map();

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
      // collectReposByNamespace(reposByWorkspace, repositories);
    }
    const excludedReposByWorkspace = new Map<string, Set<string>>();
    if (excluded_repositories?.length) {
      // collectReposByNamespace(excludedReposByWorkspace, excluded_repositories);
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
}
