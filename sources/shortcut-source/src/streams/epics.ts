import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Epic, Shortcut, ShortcutConfig} from '../shortcut';

export class Epics extends AirbyteStreamBase {
  constructor(
    private readonly config: ShortcutConfig,
    protected readonly logger: AirbyteLogger,
    protected readonly projectId?: number
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/epics.json');
  }

  get primaryKey(): StreamKey {
    return ['id'];
  }

  async *readRecords(): AsyncGenerator<Epic> {
    const shortcut = await Shortcut.instance(this.config);
    yield* shortcut.getEpics(this.projectId);
  }
}
