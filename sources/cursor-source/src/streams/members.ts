import {AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {MemberItem} from 'faros-airbyte-common/cursor';
import {Dictionary} from 'ts-essentials';

import {Cursor} from '../cursor';
import {CursorConfig} from '../types';

export class Members extends AirbyteStreamBase {
  constructor(
    private readonly config: CursorConfig,
    protected readonly logger: any
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/members.json');
  }

  get primaryKey(): StreamKey {
    return ['email'];
  }

  get supportsIncremental(): boolean {
    return true;
  }

  async *readRecords(): AsyncGenerator<MemberItem> {
    const cursor = Cursor.instance(this.config, this.logger);
    yield* await cursor.getMembers();
  }
}
