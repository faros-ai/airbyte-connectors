import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {User} from 'faros-airbyte-common/gitlab';
import {Dictionary} from 'ts-essentials';

import {GitLab} from '../gitlab';
import {GroupStreamSlice, StreamWithGroupSlices} from './common';

export class FarosUsers extends StreamWithGroupSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosUsers.json');
  }

  get primaryKey(): StreamKey {
    return ['group', 'id'];
  }

  // Although not actually an incremental stream, we run it in incremental mode
  // to avoid deleting the users that are written by other incremental streams.
  get supportsIncremental(): boolean {
    return true;
  }

  // Not used, but necessary to pass Airbyte UI validation check
  get cursorField(): string | string[] {
    return 'web_url';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: GroupStreamSlice
  ): AsyncGenerator<User & {group: string}> {
    const group = streamSlice?.group;
    const gitlab = await GitLab.instance(this.config, this.logger);
    const members = await gitlab.getGroupMembers(group);

    for (const member of members) {
      yield {
        ...member,
        group,
      };
    }
  }
}
