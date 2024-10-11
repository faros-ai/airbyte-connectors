import {AirbyteLogger, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {
  CopilotSeat,
  CopilotSeatEnded,
  CopilotSeatsStreamRecord,
} from 'faros-airbyte-common/github';
import {FarosClient, Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {DEFAULT_COPILOT_LICENSES_DATES_FIX, GitHub} from '../github';
import {GitHubConfig} from '../types';
import {
  OrgStreamSlice,
  RepoStreamSlice,
  StreamBase,
  StreamState,
  StreamWithOrgSlices,
} from './common';

export class FarosCopilotSeats extends StreamWithOrgSlices {
  protected readonly useCopilotTeamAssignmentsFix: boolean;

  constructor(
    protected readonly config: GitHubConfig,
    protected readonly logger: AirbyteLogger,
    protected readonly farosClient?: FarosClient
  ) {
    super(config, logger, farosClient);
    this.useCopilotTeamAssignmentsFix =
      config.copilot_licenses_dates_fix ?? DEFAULT_COPILOT_LICENSES_DATES_FIX;
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosCopilotSeats.json');
  }

  get primaryKey(): StreamKey {
    return ['org', 'user'];
  }

  get supportsIncremental(): boolean {
    return true;
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: OrgStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<CopilotSeatsStreamRecord> {
    const github = await GitHub.instance(this.config, this.logger);
    const org = streamSlice?.org;
    const state = streamState?.[StreamBase.orgKey(org)];
    // for Copilot data, cutoff default is beginning of time
    const cutoffDate =
      this.useCopilotTeamAssignmentsFix && state?.cutoff
        ? Utils.toDate(state.cutoff)
        : Utils.toDate(0);
    yield* github.getCopilotSeats(
      org,
      cutoffDate,
      this.useCopilotTeamAssignmentsFix
    );
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: CopilotSeatsStreamRecord,
    slice: RepoStreamSlice
  ): StreamState {
    if (!this.useCopilotTeamAssignmentsFix) {
      return {};
    }
    if (latestRecord.empty) {
      return currentStreamState;
    }
    const seat = latestRecord as CopilotSeat | CopilotSeatEnded;
    const maxCutoff = Math.max(
      Utils.toDate(seat?.teamJoinedAt ?? 0).getTime(),
      Utils.toDate(seat?.teamLeftAt ?? 0).getTime()
    );
    const latestRecordCutoff = Utils.toDate(maxCutoff);
    return this.getUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      StreamBase.orgKey(slice.org)
    );
  }
}
