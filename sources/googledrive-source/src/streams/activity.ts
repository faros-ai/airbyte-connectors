import {
  AirbyteLogger,
  AirbyteStreamBase,
  calculateUpdatedStreamState,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {DriveActivityEvent} from 'faros-airbyte-common/googledrive';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {
  DEFAULT_CUTOFF_DAYS,
  DEFAULT_INCLUDE_PERSONAL_DRIVES,
  Drive,
  GoogleDrive,
  GoogleDriveConfig,
  PersonalDrive,
  SharedDrive,
} from '../googledrive';

interface ActivityState {
  [key: string]: {cutoff: number};
}

export class Activity extends AirbyteStreamBase {
  private readonly defaultStartTime: Date;

  constructor(
    readonly config: GoogleDriveConfig,
    logger: AirbyteLogger
  ) {
    super(logger);
    this.defaultStartTime = new Date();
    this.defaultStartTime.setDate(
      this.defaultStartTime.getDate() -
        (this.config.cutoff_days ?? DEFAULT_CUTOFF_DAYS)
    );
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/activity.json');
  }

  get primaryKey(): StreamKey {
    return 'timestamp';
  }

  get cursorField(): string | string[] {
    return 'timestamp';
  }

  async *streamSlices(): AsyncGenerator<Drive> {
    const googleDrive = await GoogleDrive.instance(this.config, this.logger);
    const sharedDriveIds = this.config.shared_drive_ids ?? [];
    const includePersonalDrives =
      this.config.include_personal_drives ?? DEFAULT_INCLUDE_PERSONAL_DRIVES;

    if (includePersonalDrives) {
      const workspaceUsers = await googleDrive.queryWorkspaceUsers();
      for (const workspaceUser of workspaceUsers) {
        yield {userEmail: workspaceUser.primaryEmail} as PersonalDrive;
      }
    }

    for (const sharedDriveId of sharedDriveIds) {
      yield {sharedDriveId} as SharedDrive;
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField: string[],
    streamSlice?: Drive,
    streamState?: ActivityState
  ): AsyncGenerator<DriveActivityEvent> {
    const state = streamState?.[streamSliceToKey(streamSlice)];
    const startTime =
      syncMode === SyncMode.INCREMENTAL
        ? (Utils.toDate(state?.cutoff) ?? this.defaultStartTime)
        : this.defaultStartTime;
    const googleDrive = await GoogleDrive.instance(this.config, this.logger);
    yield* googleDrive.queryActivities(streamSlice, startTime);
  }

  getUpdatedState(
    currentStreamState: ActivityState,
    latestRecord: DriveActivityEvent,
    streamSlice?: Drive
  ): ActivityState {
    const latestRecordCutoff = Utils.toDate(latestRecord?.timestamp ?? 0);
    return calculateUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      streamSliceToKey(streamSlice)
    );
  }
}

const streamSliceToKey = (streamSlice: Drive): string => {
  if (streamSlice.userEmail) {
    return streamSlice.userEmail;
  }
  return streamSlice.sharedDriveId;
};
