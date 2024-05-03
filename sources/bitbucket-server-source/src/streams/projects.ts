import {AirbyteLogger, StreamKey} from 'faros-airbyte-cdk';
import {Project} from 'faros-airbyte-common/bitbucket-server';
import {Dictionary} from 'ts-essentials';

import {BitbucketServerConfig} from '../bitbucket-server';
import {StreamBase} from './common';

export class Projects extends StreamBase {
  constructor(
    readonly config: BitbucketServerConfig,
    readonly logger: AirbyteLogger
  ) {
    super(config, logger);
  }

  getJsonSchema(): Dictionary<any> {
    return require('../../resources/schemas/projects.json');
  }

  get primaryKey(): StreamKey {
    return 'key';
  }

  async *readRecords(): AsyncGenerator<Project> {
    yield* this.projects();
  }
}
