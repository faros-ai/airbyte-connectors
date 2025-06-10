import {AirbyteStreamBase, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {MemberItem} from 'faros-airbyte-common/cursor';
import {Dictionary} from 'ts-essentials';

import {Cursor} from '../cursor';
import {CursorConfig} from '../types';

type StreamState = {
  cutoff: number;
  members: string[];
};

export class Members extends AirbyteStreamBase {
  private readonly cutoff: number;

  constructor(
    private readonly config: CursorConfig,
    protected readonly logger: any
  ) {
    super(logger);
    this.cutoff = Date.now();
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

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: StreamState
  ): AsyncGenerator<MemberItem> {
    const cursor = Cursor.instance(this.config, this.logger);
    yield* await cursor.getMembers(streamState?.members);
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: MemberItem
  ): StreamState {
    const previousCutoff = currentStreamState?.cutoff ?? 0;
    if (this.cutoff > previousCutoff) {
      return {
        cutoff: this.cutoff,
        members: [latestRecord.email],
      };
    }
    return {
      cutoff: previousCutoff,
      members: [...currentStreamState.members, latestRecord.email],
    };
  }
}
