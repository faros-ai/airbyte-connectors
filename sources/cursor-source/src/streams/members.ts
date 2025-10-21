import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {MemberItem} from 'faros-airbyte-common/cursor';
import {Dictionary} from 'ts-essentials';

import {Cursor} from '../cursor';
import {CursorConfig} from '../types';

type StreamState = {
  minUsageTimestampPerEmail: {[email: string]: number};
};

export class Members extends AirbyteStreamBase {
  constructor(
    private readonly config: CursorConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  get dependencies(): string[] {
    return ['usage_events'];
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/members.json');
  }

  get primaryKey(): StreamKey {
    return ['email'];
  }

  get cursorField(): string | string[] {
    return 'minUsageTimestamp';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: StreamState
  ): AsyncGenerator<MemberItem> {
    const minUsageTimestampPerEmail =
      streamState?.minUsageTimestampPerEmail ?? {};
    const cursor = Cursor.instance(this.config, this.logger);
    for (const member of await cursor.getMembers()) {
      const minUsageTimestamp = Math.min(
        minUsageTimestampPerEmail[member.email] ?? Infinity,
        cursor.getMinUsageTimestampForEmail(member.email) ?? Infinity
      );
      yield {
        ...member,
        ...(minUsageTimestamp !== Infinity && {minUsageTimestamp}),
      };
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: MemberItem
  ): StreamState {
    if (!latestRecord.minUsageTimestamp) {
      return currentStreamState;
    }
    return {
      minUsageTimestampPerEmail: {
        ...currentStreamState?.minUsageTimestampPerEmail,
        [latestRecord.email]: latestRecord.minUsageTimestamp,
      },
    };
  }
}
