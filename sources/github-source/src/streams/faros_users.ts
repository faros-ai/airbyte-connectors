import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {User} from 'faros-airbyte-common/github';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {OrgStreamSlice, StreamWithOrgSlices} from './common';

export class FarosUsers extends StreamWithOrgSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosUsers.json');
  }

  get primaryKey(): StreamKey {
    return ['org', 'login'];
  }

  // Although not actually an incremental stream, we run it in incremental mode
  // to avoid deleting the users that are written by other incremental streams.
  get supportsIncremental(): boolean {
    return true;
  }

  // Not used, but necessary to pass Airbyte UI validation check
  get cursorField(): string | string[] {
    return 'html_url';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: OrgStreamSlice
  ): AsyncGenerator<User> {
    const org = streamSlice?.org;
    const github = await GitHub.instance(this.config, this.logger);
    yield* github.getOrganizationMembers(org);
  }
}
