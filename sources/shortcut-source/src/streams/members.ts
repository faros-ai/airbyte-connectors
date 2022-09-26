import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Member, Shortcut, ShortcutConfig} from '../shortcut';
export class Members extends AirbyteStreamBase {
  constructor(
    private readonly config: ShortcutConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/members.json');
  }
  get primaryKey(): StreamKey {
    return ['id'];
  }
  async *readRecords(): AsyncGenerator<Member> {
    const shortcut = await Shortcut.instance(this.config);
    yield* shortcut.getMembers();
  }
}
