import {
  AirbyteLogger,
  AirbyteStreamBase,
  calculateUpdatedStreamState,
} from 'faros-airbyte-cdk';
import {toLower} from 'lodash';

import {BitbucketConfig} from '../types';
import {WorkspaceRepoFilter} from '../workspace-repo-filter';

export type StreamState = {
  readonly [workspaceRepoKey: string]: {
    cutoff: number;
  };
};

export type WorkspaceStreamSlice = {
  workspace: string;
};

export type RepoStreamSlice = {
  workspace: string;
  repo: string;
};

export abstract class StreamBase extends AirbyteStreamBase {
  readonly workspaceRepoFilter: WorkspaceRepoFilter;

  constructor(
    protected readonly config: BitbucketConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
    this.workspaceRepoFilter = new WorkspaceRepoFilter(config, logger);
  }

  protected getUpdatedStreamState(
    latestRecordCutoff: Date,
    currentStreamState: StreamState,
    workspaceRepoKey: string
  ): StreamState {
    return calculateUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      workspaceRepoKey
    );
  }

  static workspaceKey(workspace: string): string {
    return toLower(workspace);
  }

  static workspaceRepoKey(workspace: string, repository: string): string {
    return toLower(`${workspace}/${repository}`);
  }
}

export abstract class StreamWithWorkspaceSlices extends StreamBase {
  async *streamSlices(): AsyncGenerator<WorkspaceStreamSlice> {
    for (const workspace of await this.workspaceRepoFilter.getWorkspaces()) {
      yield {workspace};
    }
  }
}

export abstract class StreamWithRepoSlices extends StreamBase {
  async *streamSlices(): AsyncGenerator<RepoStreamSlice> {
    for (const workspace of await this.workspaceRepoFilter.getWorkspaces()) {
      for (const repo of await this.workspaceRepoFilter.getRepositories(
        workspace
      )) {
        yield {workspace, repo: repo.slug};
      }
    }
  }
}
