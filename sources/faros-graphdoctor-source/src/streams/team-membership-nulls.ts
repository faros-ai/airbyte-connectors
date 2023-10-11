import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {FarosClient} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {GraphQLConfig} from '..';
import {orgTeamAssignmentNullTeam} from '../graphdoctor';

//import {Gitlab, GitlabConfig, Group} from '../gitlab';

export class OrgTeamMembershipNulls extends AirbyteStreamBase {
  constructor(
    readonly config: GraphQLConfig,
    readonly logger: AirbyteLogger,
    readonly farosClient: FarosClient
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/OrgTeamMembershipNulls.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(): AsyncGenerator<any> {
    yield* orgTeamAssignmentNullTeam(this.config, this.farosClient);
  }
}
