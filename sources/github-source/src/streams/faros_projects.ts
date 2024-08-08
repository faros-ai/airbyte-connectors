import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Project} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {DEFAULT_FETCH_PROJECTS_CLASSIC, GitHub} from '../github';
import {
  OrgStreamSlice,
  RepoStreamSlice,
  StreamBase,
  StreamState,
  StreamWithOrgSlices,
} from './common';

export class FarosProjects extends StreamWithOrgSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosProjects.json');
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
    streamSlice?: OrgStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<Project> {
    const github = await GitHub.instance(this.config, this.logger);
    const org = streamSlice?.org;
    const state = streamState?.[StreamBase.orgKey(org)];
    const [startDate, endDate] =
      syncMode === SyncMode.INCREMENTAL
        ? this.getUpdateRange(state?.cutoff)
        : this.getUpdateRange();
    yield* github.getProjects(org, startDate, endDate);
    if (this.config.fetch_projects_classic ?? DEFAULT_FETCH_PROJECTS_CLASSIC) {
      yield* github.getClassicProjects(org, startDate, endDate);
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: Project,
    slice: RepoStreamSlice
  ): StreamState {
    const latestRecordCutoff = Utils.toDate(latestRecord?.updated_at ?? 0);
    return this.getUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      StreamBase.orgKey(slice.org)
    );
  }
}
