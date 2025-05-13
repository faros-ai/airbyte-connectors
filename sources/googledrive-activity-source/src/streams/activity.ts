import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {
  DriveActivityEvent,
  GoogleDriveActivity,
  GoogleDriveActivityConfig,
} from '../googledriveactivity';

interface ActivityState {
  primaryTime?: string;
}

export class ActivityStream extends AirbyteStreamBase {
  constructor(readonly config: GoogleDriveActivityConfig, logger: AirbyteLogger) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/activity.json');
  }
  
  get primaryKey(): StreamKey {
    return 'timeStamp'; 
  }
  
  get cursorField(): string | string[] {
    return 'primaryTime';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField: string[],
    streamSlice?: Dictionary<any, string>,
    streamState?: ActivityState
  ): AsyncGenerator<DriveActivityEvent> {
    const googleDriveActivity = await GoogleDriveActivity.instance(
      this.config,
      this.logger
    );
    
    const timeFilterType = syncMode === SyncMode.INCREMENTAL ? 'startTime' : 'time';
    const startTime = syncMode === SyncMode.INCREMENTAL ? streamState?.primaryTime : undefined;
    
    this.logger.info(
      `Reading Drive Activity records with sync mode ${syncMode}${
        startTime ? `, starting from ${startTime}` : ''
      }`
    );
    
    yield* googleDriveActivity.queryActivities(timeFilterType, startTime);
  }

  getUpdatedState(
    currentStreamState: ActivityState,
    latestRecord: DriveActivityEvent
  ): ActivityState {
    if (latestRecord?.primaryTime) {
      const recordTime = latestRecord.primaryTime;
      const currentTime = currentStreamState?.primaryTime;
      
      if (!currentTime || new Date(recordTime) > new Date(currentTime)) {
        return {
          ...currentStreamState,
          primaryTime: recordTime,
        };
      }
    }
    return currentStreamState;
  }
}
