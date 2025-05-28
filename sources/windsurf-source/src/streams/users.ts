import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {WindsurfConfig} from '../config';
import {UserData, StreamSlice} from '../models';
import {WindsurfClient} from '../client';

export class Users extends AirbyteStreamBase {
  constructor(
    private readonly config: WindsurfConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/users.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  get cursorField(): string | string[] {
    return 'updated_at';
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
  ): AsyncGenerator<UserData> {
    const client = WindsurfClient.instance(this.config, this.logger);
    const lastCutoff = streamState?.updated_at;
    
    yield* client.getUserData(lastCutoff);
  }

  getUpdatedState(
    currentStreamState: Dictionary<any>,
    latestRecord: Dictionary<any>
  ): Dictionary<any> {
    const currentUpdatedAt = currentStreamState?.updated_at ?? '';
    const latestUpdatedAt = latestRecord?.updated_at ?? '';

    return {
      updated_at: 
        !currentUpdatedAt || !latestUpdatedAt || 
        new Date(latestUpdatedAt) > new Date(currentUpdatedAt)
          ? latestUpdatedAt
          : currentUpdatedAt,
    };
  }
}
