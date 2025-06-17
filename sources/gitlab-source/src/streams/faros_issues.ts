import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
type Issue = any;
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {GitLab} from '../gitlab';
import {
  ProjectStreamSlice,
  StreamBase,
  StreamState,
  StreamWithProjectSlices,
} from './common';

export class FarosIssues extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosIssues.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  get cursorField(): string {
    return 'updated_at';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<Issue> {
    const gitlab = await GitLab.instance(this.config, this.logger);
    const project = streamSlice?.project;
    if (!project) {
      return;
    }

    const groupKey = StreamBase.groupProjectKey(
      streamSlice.group_id,
      project.path
    );
    const [since, until] = this.getUpdateRange(streamState?.[groupKey]?.cutoff);

    this.logger.info(
      `Syncing GitLab issues for project ${project.path_with_namespace} from ${since.toISOString()} to ${until.toISOString()}`
    );

    try {
      for await (const issue of gitlab.getIssues(
        project.path_with_namespace,
        since,
        until
      )) {
        yield {
          ...issue,
          group_id: streamSlice.group_id,
          project_path: project.path,
        };
      }
    } catch (err: any) {
      this.logger.error(
        `Failed to fetch issues for project ${project.path_with_namespace}: ${err.message}`
      );
      throw err;
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: Issue
  ): StreamState {
    const groupKey = StreamBase.groupProjectKey(
      latestRecord.group_id,
      latestRecord.project_path
    );
    return this.getUpdatedStreamState(
      Utils.toDate(latestRecord.updated_at),
      currentStreamState,
      groupKey
    );
  }
}
