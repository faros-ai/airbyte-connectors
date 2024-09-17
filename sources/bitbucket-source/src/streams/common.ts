import {
  AirbyteLogger,
  AirbyteStreamBase,
  calculateUpdatedStreamState,
} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
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

export enum RunMode {
  Minimum = 'Minimum',
  Full = 'Full',
  Custom = 'Custom',
}

export const MinimumStreamNames = [
  'commits',
  'pull_requests',
  'workspaces',
  'workspace_users',
  'repositories',
];

export const FullStreamNames = [
  'commits',
  'pull_requests',
  'pull_request_activities',
  'workspaces',
  'workspace_users',
  'repositories',
];

export const CustomStreamNames = [
  'commits',
  'pull_requests',
  'pull_request_activities',
  'workspaces',
  'workspace_users',
  'repositories',
  'issues',
  'tags',
];

export const RunModeStreams = {
  [RunMode.Minimum]: MinimumStreamNames,
  [RunMode.Full]: FullStreamNames,
  [RunMode.Custom]: CustomStreamNames,
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

  protected getUpdateRange(cutoff?: number): [Date, Date] {
    return [
      cutoff ? Utils.toDate(cutoff) : this.config.startDate,
      this.config.endDate,
    ];
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
