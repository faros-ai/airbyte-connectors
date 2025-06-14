import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {GitLab} from '../gitlab';
import {
  ProjectStreamSlice,
  StreamBase,
  StreamState,
  StreamWithProjectSlices,
} from './common';

export interface MergeRequest {
  readonly id: string;
  readonly iid: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly mergedAt?: string;
  readonly author?: {
    readonly name?: string;
    readonly publicEmail?: string;
    readonly username: string;
    readonly webUrl?: string;
  };
  readonly assignees?: {
    readonly nodes?: Array<{
      readonly name?: string;
      readonly publicEmail?: string;
      readonly username: string;
      readonly webUrl?: string;
    }>;
  };
  readonly mergeCommitSha?: string;
  readonly commitCount: number;
  readonly userNotesCount: number;
  readonly diffStatsSummary: {
    readonly additions: number;
    readonly deletions: number;
    readonly fileCount: number;
  };
  readonly state: string;
  readonly title: string;
  readonly webUrl: string;
  readonly notes: Array<{
    readonly id: string;
    readonly author?: {
      readonly name?: string;
      readonly publicEmail?: string;
      readonly username: string;
      readonly webUrl?: string;
    };
    readonly body: string;
    readonly system: boolean;
    readonly createdAt: string;
    readonly updatedAt: string;
  }>;
  readonly labels?: {
    readonly pageInfo?: {
      readonly endCursor?: string;
      readonly hasNextPage: boolean;
    };
    readonly nodes?: Array<{
      readonly title: string;
    }>;
  };
  readonly project_path: string;
  readonly group_id: string;
}

export class FarosMergeRequests extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosMergeRequests.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  get cursorField(): string | string[] {
    return 'updatedAt';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<MergeRequest> {
    const groupId = streamSlice?.group_id;
    const project = streamSlice?.project;

    if (!groupId || !project) {
      return;
    }

    const gitlab = await GitLab.instance(this.config, this.logger);
    const stateKey = StreamBase.groupProjectKey(
      groupId,
      project.path_with_namespace
    );
    const state = streamState?.[stateKey];
    const [startDate, endDate] =
      syncMode === SyncMode.INCREMENTAL
        ? this.getUpdateRange(state?.cutoff)
        : this.getUpdateRange();

    this.logger.info(
      `Fetching merge requests for project ${project.path_with_namespace} from ${startDate.toISOString()} to ${endDate.toISOString()}`
    );

    for await (const mergeRequest of gitlab.getMergeRequestsWithNotes(
      project.path_with_namespace,
      startDate,
      endDate
    )) {
      yield {
        ...mergeRequest,
        group_id: groupId,
      };
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: MergeRequest,
    slice: ProjectStreamSlice
  ): StreamState {
    const latestRecordCutoff = Utils.toDate(latestRecord?.updatedAt ?? 0);
    return this.getUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      StreamBase.groupProjectKey(
        slice.group_id,
        slice.project.path_with_namespace
      )
    );
  }
}
