import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {FarosClient} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {GraphQLConfig} from '..';
import {orgTeamParentNull} from '../graphdoctor';

//import {Gitlab, GitlabConfig, Group} from '../gitlab';

export class OrgTeamParentNulls extends AirbyteStreamBase {
  constructor(
    readonly config: GraphQLConfig,
    readonly logger: AirbyteLogger,
    readonly farosClient: FarosClient
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/OrgTeamParentNulls.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(): AsyncGenerator<any> {
    yield* orgTeamParentNull(this.config, this.farosClient);
  }
}
