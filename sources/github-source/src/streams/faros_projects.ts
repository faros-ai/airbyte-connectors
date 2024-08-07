import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Project, Team} from 'faros-airbyte-common/github';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {
  OrgStreamSlice,
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
    const cutoffDate = this.getUpdateStartDate(state?.cutoff);
    for await (const project of github.getProjects(org, cutoffDate)) {
      yield project;
    }
    for await (const classicProject of github.getClassicProjects(
      org,
      cutoffDate
    )) {
      yield classicProject;
    }
  }
}
