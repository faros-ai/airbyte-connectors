import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Bitbucket} from '../bitbucket';
import {BitbucketConfig, Workspace} from '../types';

export class Workspaces extends AirbyteStreamBase {
  constructor(
    readonly config: BitbucketConfig,
    logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any> {
    return require('../../resources/schemas/workspaces.json');
  }
  get primaryKey(): StreamKey {
    return ['uuid'];
  }

  async *readRecords(): AsyncGenerator<Workspace> {
    const bitbucket = Bitbucket.instance(this.config, this.logger);

    yield* bitbucket.getWorkspaces();
  }
}
