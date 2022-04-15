import {AirbyteStreamBase, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {AirbyteLogger} from 'faros-airbyte-cdk/lib';
import {Dictionary} from 'ts-essentials';

import {Gitlab, GitlabConfig, Group} from '../gitlab';

export class Groups extends AirbyteStreamBase {
  constructor(readonly config: GitlabConfig, readonly logger: AirbyteLogger) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/groups.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any, string>,
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<Group> {
    const gitlab = Gitlab.instance(this.config, this.logger);

    yield* gitlab.getGroups(this.config.groupName, this.config.projects);
  }
}
