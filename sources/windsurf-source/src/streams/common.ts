import {AirbyteLogger, AirbyteStreamBase, SyncMode} from 'faros-airbyte-cdk';

import {WindsurfConfig} from '../types';
import {Windsurf} from '../windsurf';

export type UserStreamSlice = {
  email: string;
  apiKey: string;
};

export type UserStreamState = {
  readonly [email: string]: {
    cutoff: string;
  };
};

export abstract class StreamBase extends AirbyteStreamBase {
  constructor(
    protected readonly config: WindsurfConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }
}

export abstract class StreamWithUserSlices extends StreamBase {
  async *streamSlices(): AsyncGenerator<UserStreamSlice> {
    const windsurf = Windsurf.instance(this.config, this.logger);
    const users = await windsurf.getUserPageAnalytics();

    for (const user of users) {
      if (user.email && user.apiKey) {
        yield {email: user.email, apiKey: user.apiKey};
      }
    }
  }

  protected getEmailState(
    streamState: UserStreamState | undefined,
    email: string
  ): {cutoff: string} | undefined {
    return streamState?.[email];
  }

  protected getStartDate(
    syncMode: SyncMode,
    emailState: {cutoff: string} | undefined
  ): Date | undefined {
    return syncMode === SyncMode.INCREMENTAL && emailState?.cutoff
      ? new Date(emailState.cutoff)
      : this.config.startDate;
  }

  protected getEndDate(): Date | undefined {
    return this.config.endDate;
  }

  protected updateStreamState<T extends {day: string}>(
    currentStreamState: UserStreamState,
    latestRecord: T,
    slice: UserStreamSlice
  ): UserStreamState {
    const email = slice.email;
    const currentEmailState = currentStreamState?.[email];
    const recordDate = latestRecord.day;

    // Update state with the latest date seen for this email
    if (!currentEmailState?.cutoff || recordDate > currentEmailState.cutoff) {
      return {
        ...currentStreamState,
        [email]: {
          cutoff: recordDate,
        },
      };
    }

    return currentStreamState;
  }
}
