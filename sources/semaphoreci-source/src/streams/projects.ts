import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Project} from '../semaphoreci/models';
import {SemaphoreCI, SemaphoreCIConfig} from '../semaphoreci/semaphoreci';

export class Projects extends AirbyteStreamBase {
  constructor(
    private readonly config: SemaphoreCIConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/projects.json');
  }
  get primaryKey(): StreamKey {
    return [['metadata', 'id']];
  }

  async *readRecords(): AsyncGenerator<Project> {
    const semaphoreci = SemaphoreCI.instance(this.config, this.logger);

    for (const project of await semaphoreci.getProjects()) {
      yield project;
    }
  }
}
