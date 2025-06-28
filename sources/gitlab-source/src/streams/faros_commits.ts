import {StreamKey, SyncMode, StateManagerFactory, FieldExtractors, KeyGenerators} from 'faros-airbyte-cdk';
import {FarosCommitOutput} from 'faros-airbyte-common/gitlab';
import {Dictionary} from 'ts-essentials';

import {GitLab} from '../gitlab';
import {
  ProjectStreamSlice,
  StreamBase,
  StreamState,
  StreamWithProjectSlices,
} from './common';

export class FarosCommits extends StreamWithProjectSlices {
  // Initialize state manager using generic configuration for GitLab commits
  private readonly stateManager = StateManagerFactory.create<FarosCommitOutput, ProjectStreamSlice>({
    fieldExtractor: FieldExtractors.timestamp<FarosCommitOutput>('created_at'),
    keyGenerator: KeyGenerators.custom<ProjectStreamSlice>((slice) => `${slice.group_id}/${slice.path_with_namespace}`)
  });
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

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: FarosCommitOutput,
    slice: ProjectStreamSlice,
  ): StreamState {
    // Use the generic state manager instead of manual implementation
    return this.stateManager.getUpdatedState(currentStreamState, latestRecord, slice);
  }
}
