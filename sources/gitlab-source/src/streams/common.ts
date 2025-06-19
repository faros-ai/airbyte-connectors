import {
  AirbyteLogger,
  AirbyteStreamBase,
  calculateUpdatedStreamState,
} from 'faros-airbyte-cdk';
import {FarosProjectOutput} from 'faros-airbyte-common/gitlab';
import {FarosClient, Utils} from 'faros-js-client';
import {pick, toLower} from 'lodash';

import {GroupFilter} from '../group-filter';
import {GitLabConfig} from '../types';

export interface GroupStreamSlice {
  group: string;
}

export type ProjectStreamSlice = Pick<
  FarosProjectOutput,
  'default_branch' | 'group_id' | 'path' | 'path_with_namespace'
>;

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

export abstract class StreamBase extends AirbyteStreamBase {
  readonly groupFilter: GroupFilter;
  constructor(
    protected readonly config: GitLabConfig,
    protected readonly logger: AirbyteLogger,
    protected readonly farosClient?: FarosClient,
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

  protected getUpdatedStreamState(
    latestRecordCutoff: Date,
    currentStreamState: StreamState,
    groupKey: string,
  ): StreamState {
    return calculateUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      groupKey,
    );
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
    for (const group of await this.groupFilter.getGroups()) {
      yield {group};
    }
  }
}

export abstract class StreamWithProjectSlices extends StreamBase {
  async *streamSlices(): AsyncGenerator<ProjectStreamSlice> {
    for (const group of await this.groupFilter.getGroups()) {
      for (const {repo, syncRepoData} of await this.groupFilter.getProjects(
        group,
      )) {
        if ((repo as any).empty_repo === true) {
          this.logger.warn(
            `Skipping project ${repo.path_with_namespace} for group ${group} since it has an empty source repository`,
          );
          continue;
        }
        if (syncRepoData) {
          yield {
            ...pick(repo, [
              'default_branch',
              'group_id',
              'path',
              'path_with_namespace',
            ]),
          };
        }
      }
    }
  }
}
