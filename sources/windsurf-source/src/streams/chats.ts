import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {WindsurfConfig} from '../config';
import {ChatData, StreamSlice} from '../models';
import {WindsurfClient} from '../client';

export class Chats extends AirbyteStreamBase {
  constructor(
    private readonly config: WindsurfConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/chats.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  get cursorField(): string | string[] {
    return 'timestamp';
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    const client = WindsurfClient.instance(this.config, this.logger);
    
    yield {
      start_date: client['startDate'],
      end_date: client['endDate']
    };
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<ChatData> {
    const client = WindsurfClient.instance(this.config, this.logger);
    const lastCutoff = streamState?.timestamp;
    
    yield* client.getChatData(lastCutoff);
  }

  getUpdatedState(
    currentStreamState: Dictionary<any>,
    latestRecord: Dictionary<any>
  ): Dictionary<any> {
    const currentTimestamp = currentStreamState?.timestamp ?? '';
    const latestTimestamp = latestRecord?.timestamp ?? '';

    return {
      timestamp: 
        !currentTimestamp || !latestTimestamp || 
        new Date(latestTimestamp) > new Date(currentTimestamp)
          ? latestTimestamp
          : currentTimestamp,
    };
  }
}
