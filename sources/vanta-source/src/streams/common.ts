import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {isNil} from 'lodash';

import {VantaConfig} from '../index';
import {DEFAULT_CUTOFF_DAYS} from '../vanta';

export type StreamState = {
  cutoff: number;
};

export abstract class StreamBase extends AirbyteStreamBase {
  constructor(
    protected readonly cfg: VantaConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  protected getUpdatedStreamState(
    latestRecordCutoff: Date,
    currentStreamState: StreamState
  ): StreamState {
    if (isNil(latestRecordCutoff)) {
      return currentStreamState;
    }
    const currentCutOff = Utils.toDate(currentStreamState?.cutoff ?? 0);

    if (latestRecordCutoff > currentCutOff) {
      return {
        cutoff: latestRecordCutoff.getTime(),
      };
    }
    return currentStreamState;
  }

  protected getRemediatedAfter(cutoff?: number): Date {
    if (cutoff) {
      return Utils.toDate(cutoff);
    }
    const startDate = new Date();
    const cutoffDays = this.cfg.cutoff_days ?? DEFAULT_CUTOFF_DAYS;
    startDate.setDate(startDate.getDate() - cutoffDays);
    return startDate;
  }
}
