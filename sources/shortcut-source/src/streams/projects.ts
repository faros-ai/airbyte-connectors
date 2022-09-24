import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Project, Shortcut, ShortcutConfig} from '../shortcut';
export class Projects extends AirbyteStreamBase {
  constructor(
    private readonly config: ShortcutConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/projects.json');
  }
  get primaryKey(): StreamKey {
    return ['id'];
  }
  async *readRecords(): AsyncGenerator<Project> {
    const shortcut = await Shortcut.instance(this.config);
    yield* shortcut.getProjects();
  }
}
