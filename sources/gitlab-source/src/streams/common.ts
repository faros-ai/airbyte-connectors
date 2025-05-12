import {
  AirbyteLogger,
  AirbyteStreamBase,
  calculateUpdatedStreamState,
  StreamKey,
  StreamState as AirbyteStreamState,
} from 'faros-airbyte-cdk';
import {FarosClient, Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';
import {toLower} from 'lodash';
import VError from 'verror';

import {GitLabConfig} from '../types';

/** Run mode determines which streams to sync */
export enum RunMode {
  /** Sync minimal set of streams */
  Minimum = 'Minimum',
  /** Sync all streams */
  Full = 'Full',
  /** Sync only specified streams */
  Custom = 'Custom',
}

/** Stream names for each run mode */
export const RunModeStreams: Record<RunMode, ReadonlyArray<string>> = {
  [RunMode.Minimum]: [
    'gitlab_groups',
    'gitlab_projects',
    'gitlab_users',
    'gitlab_merge_requests',
  ],
  [RunMode.Full]: [
    'gitlab_groups',
    'gitlab_projects',
    'gitlab_users',
    'gitlab_merge_requests',
    'gitlab_issues',
    'gitlab_commits',
    'gitlab_tags',
    'gitlab_releases',
  ],
  [RunMode.Custom]: [],
};

export type StreamState = {
  readonly [groupProjectKey: string]: {
    cutoff: string;
  };
};

/** Stream slice for project-based streams */
export interface ProjectStreamSlice {
  readonly group: string;
  readonly project: string;
}

/** Base class for all GitLab streams */
export abstract class StreamBase extends AirbyteStreamBase {
  constructor(
    protected readonly config: GitLabConfig,
    protected readonly logger: AirbyteLogger,
    protected readonly farosClient?: FarosClient
  ) {
    super(logger);
  }

  /**
   * Get workspace-repo filter instance
   */
  protected async getWorkspaceRepoFilter() {
    const {WorkspaceRepoFilter} = await import('../workspace-repo-filter');
    return WorkspaceRepoFilter.instance(this.config, this.logger, this.farosClient);
  }

  /**
   * Get date range for updates based on cutoff
   */
  protected getUpdateRange(cutoff: string | null): [Date, Date] {
    const endDate = this.config.endDate ?? new Date();
    let startDate: Date;

    if (cutoff) {
      startDate = new Date(cutoff);
    } else {
      startDate = this.config.startDate ?? new Date();
    }

    return [startDate, endDate];
  }

  /**
   * Get updated stream state with new cutoff
   */
  protected getUpdatedStreamState(
    latestRecordCutoff: Date,
    currentStreamState: StreamState,
    groupProjectKey: string
  ): StreamState {
    return calculateUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState as unknown as AirbyteStreamState,
      groupProjectKey
    ) as unknown as StreamState;
  }

  /**
   * Create a key for a group
   */
  static groupKey(group: string): string {
    return toLower(group);
  }

  /**
   * Create a key for a group/project combination
   */
  static groupProjectKey(group: string, project: string): string {
    return toLower(`${group}/${project}`);
  }
}

/** Base class for streams that iterate over projects */
export abstract class StreamWithProjectSlices extends StreamBase {
  constructor(
    protected readonly config: GitLabConfig,
    protected readonly logger: AirbyteLogger,
    protected readonly farosClient?: FarosClient
  ) {
    super(config, logger, farosClient);
  }

  /**
   * Get stream slices for this stream
   * Each slice represents a project to process
   */
  async *streamSlices(): AsyncGenerator<ProjectStreamSlice> {
    const filter = await this.getWorkspaceRepoFilter();
    const groups = await filter.getGroups();

    for (const group of groups) {
      const projects = await filter.getProjects(group);
      for (const {project, syncProjectData} of projects) {
        if (syncProjectData) {
          yield {group, project: project.name};
        }
      }
    }
  }

  /**
   * Get cutoff date from stream state for a specific project
   */
  protected getCutoffFromState(
    streamState: StreamState,
    group: string,
    project: string
  ): string | null {
    if (!streamState) return null;

    const projectKey = StreamBase.groupProjectKey(group, project);
    return streamState[projectKey]?.cutoff ?? null;
  }
}
