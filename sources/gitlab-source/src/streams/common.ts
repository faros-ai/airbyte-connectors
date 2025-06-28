import {
  AirbyteLogger,
  IncrementalStreamBase,
} from 'faros-airbyte-cdk';
import {Project} from 'faros-airbyte-common/gitlab';
import {FarosClient, Utils} from 'faros-js-client';
import {toLower} from 'lodash';
import {Dictionary} from 'ts-essentials';

import {GroupFilter} from '../group-filter';
import {GitLabConfig} from '../types';

export interface GroupStreamSlice {
  group_id: string;
}

export type ProjectStreamSlice = {
  group_id: string;
  project: Pick<Project, 'path_with_namespace' | 'default_branch' | 'path'>;
};

export interface StreamState {
  readonly [key: string]: {
    cutoff: number;
  };
}

export enum RunMode {
  Minimum = 'Minimum',
  Full = 'Full',
  Custom = 'Custom',
}

export const MinimumStreamNames = [
  'faros_commits',
  'faros_groups',
  'faros_issues',
  'faros_merge_requests',
  'faros_merge_request_reviews',
  'faros_projects',
  'faros_tags',
];

export const FullStreamNames = [
  'faros_commits',
  'faros_groups',
  'faros_issues',
  'faros_merge_requests',
  'faros_merge_request_reviews',
  'faros_projects',
  'faros_tags',
  'faros_users',
];

// fill as streams are developed
export const CustomStreamNames = [
  'faros_commits',
  'faros_groups',
  'faros_issues',
  'faros_merge_requests',
  'faros_merge_request_reviews',
  'faros_projects',
  'faros_tags',
  'faros_users',
];

export const RunModeStreams: {
  [key in RunMode]: string[];
} = {
  [RunMode.Minimum]: MinimumStreamNames,
  [RunMode.Full]: FullStreamNames,
  [RunMode.Custom]: CustomStreamNames,
};

export abstract class StreamBase extends IncrementalStreamBase {
  readonly groupFilter: GroupFilter;
  constructor(
    protected readonly config: GitLabConfig,
    protected readonly logger: AirbyteLogger,
    protected readonly farosClient?: FarosClient
  ) {
    super(logger);
    this.groupFilter = GroupFilter.instance(config, logger, farosClient);
  }

  protected getUpdateRange(cutoff?: number): [Date, Date] {
    return [
      cutoff ? Utils.toDate(cutoff) : this.config.startDate,
      this.config.endDate,
    ];
  }

  protected getStateKey(streamSlice?: Dictionary<any>): string {
    if (streamSlice && 'group_id' in streamSlice && streamSlice.project) {
      return StreamBase.groupProjectKey(streamSlice.group_id, streamSlice.project.path);
    }
    if (streamSlice && 'group' in streamSlice) {
      return StreamBase.groupKey(streamSlice.group);
    }
    return 'gitlab';
  }

  static groupKey(group: string): string {
    return toLower(`${group}`);
  }

  static groupProjectKey(group: string, projectPath: string): string {
    return toLower(`${group}/${projectPath}`);
  }
}

export abstract class StreamWithGroupSlices extends StreamBase {
  async *streamSlices(): AsyncGenerator<GroupStreamSlice> {
    for (const group_id of await this.groupFilter.getGroups()) {
      yield {group_id};
    }
  }
}

export abstract class StreamWithProjectSlices extends StreamBase {
  async *streamSlices(): AsyncGenerator<ProjectStreamSlice> {
    for (const group_id of await this.groupFilter.getGroups()) {
      for (const {repo, syncRepoData} of await this.groupFilter.getProjects(
        group_id
      )) {
        if (repo.empty_repo) {
          this.logger.warn(
            `Skipping project ${repo.path_with_namespace} for group ${group_id} since it has an empty source repository`
          );
          continue;
        }
        if (syncRepoData) {
          yield {
            group_id: repo.group_id,
            project: {
              path_with_namespace: repo.path_with_namespace,
              default_branch: repo.default_branch,
              path: repo.path,
            },
          };
        }
      }
    }
  }
}
