import {IncrementalStreamBase, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {FarosCommitOutput} from 'faros-airbyte-common/gitlab';
import {pick} from 'lodash';
import {Dictionary} from 'ts-essentials';

import {GitLab} from '../gitlab';
import {GroupFilter} from '../group-filter';
import {GitLabConfig} from '../types';
import {
  ProjectStreamSlice,
  StreamBase,
  StreamState,
} from './common';

export class FarosCommits extends IncrementalStreamBase<StreamState, FarosCommitOutput, ProjectStreamSlice> {
  readonly groupFilter: GroupFilter;
  
  constructor(
    protected readonly config: GitLabConfig,
    protected readonly logger: any,
    protected readonly farosClient?: any,
  ) {
    super(logger);
    this.groupFilter = GroupFilter.instance(config, logger, farosClient);
  }

  get name(): string {
    return 'faros_commits';
  }
  /**
   * Depends on faros_users stream to ensure users are collected first.
   * The UserCollector needs to have all users populated before we can
   * resolve commit authors from display names to usernames.
   */
  get dependencies(): ReadonlyArray<string> {
    return ['faros_users'];
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosCommits.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  get cursorField(): string | string[] {
    return 'created_at';
  }

  protected getStateKey(streamSlice?: ProjectStreamSlice): string {
    if (streamSlice) {
      return StreamBase.groupProjectKey(streamSlice.group_id, streamSlice.path_with_namespace);
    }
    return this.name;
  }

  private getUpdateRange(cutoff?: string | number): [Date, Date] {
    const now = new Date();
    const since = cutoff ? new Date(cutoff) : new Date(0);
    return [since, now];
  }

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

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectStreamSlice,
    streamState?: StreamState,
  ): AsyncGenerator<FarosCommitOutput> {
    const gitlab = await GitLab.instance(this.config, this.logger);
    const stateKey = StreamBase.groupProjectKey(
      streamSlice.group_id,
      streamSlice.path_with_namespace,
    );
    const state = streamState?.[stateKey];
    const [startDate, endDate] =
      syncMode === SyncMode.INCREMENTAL
        ? this.getUpdateRange(state?.cutoff)
        : this.getUpdateRange();

    for await (const commit of gitlab.getCommits(
      streamSlice.path_with_namespace,
      streamSlice.default_branch,
      startDate,
      endDate,
    )) {
      yield {
        ...commit,
        branch: streamSlice.default_branch,
        group_id: streamSlice.group_id,
        project_path: streamSlice.path,
      };
    }
  }

}
