import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Gitlab, GitlabConfig, Group} from '../gitlab';

export class Groups extends AirbyteStreamBase {
  constructor(
    readonly config: GitlabConfig,
    readonly gitlab: Gitlab,
    readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/groups.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(): AsyncGenerator<Group> {
    yield* this.gitlab.getGroups(this.config.groupName, this.config.projects);
  }
}
