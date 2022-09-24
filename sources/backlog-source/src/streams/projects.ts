import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Backlog, BacklogConfig} from '../backlog';
import {Project} from '../models';

export class Projects extends AirbyteStreamBase {
  constructor(
    private readonly config: BacklogConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/projects.json');
  }

  get primaryKey(): StreamKey {
    return ['id', 'source'];
  }

  async *readRecords(): AsyncGenerator<Project, any, unknown> {
    const backlog = await Backlog.instance(this.config, this.logger);
    yield* backlog.getProjects();
  }
}
