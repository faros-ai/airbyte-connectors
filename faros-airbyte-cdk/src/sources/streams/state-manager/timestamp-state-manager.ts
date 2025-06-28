import {Utils} from 'faros-js-client';
import moment from 'moment';
import {
  FieldExtractor,
  KeyGenerator,
  StateManager,
  StreamState,
  TimestampStateConfig
} from './interfaces';

/**
 * Generic timestamp-based state manager for incremental sync
 * 
 * This manager handles the common pattern of tracking cutoff timestamps
 * per partition key (e.g., per repo, per project, etc.)
 */
export class TimestampStateManager<TRecord, TSlice> 
  implements StateManager<StreamState, TRecord, TSlice> {
  
  private readonly fieldExtractor: FieldExtractor<TRecord, Date | string | number>;
  private readonly keyGenerator: KeyGenerator<TSlice>;
  private readonly cutoffLagDays: number;

  constructor(config: TimestampStateConfig<TRecord, TSlice>) {
    this.fieldExtractor = config.fieldExtractor;
    this.keyGenerator = config.keyGenerator;
    this.cutoffLagDays = config.cutoffLagDays ?? 0;
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: TRecord,
    slice: TSlice
  ): StreamState {
    // Extract timestamp from the record
    const extractedValue = this.fieldExtractor.extract(latestRecord);
    const latestRecordCutoff = Utils.toDate(extractedValue ?? 0);
    
    // Generate key for this slice
    const key = this.keyGenerator.generateKey(slice);
    
    // Update state using the same logic as the original calculateUpdatedStreamState
    return this.calculateUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      key
    );
  }

  /**
   * Internal method that replicates the logic from the original calculateUpdatedStreamState
   */
  private calculateUpdatedStreamState(
    latestRecordCutoff: Date,
    currentStreamState: StreamState,
    key: string
  ): StreamState {
    if (latestRecordCutoff == null || latestRecordCutoff === undefined) {
      return currentStreamState;
    }

    const currentCutoff = Utils.toDate(currentStreamState?.[key]?.cutoff ?? 0);

    const adjustedLatestRecordCutoff = moment(latestRecordCutoff)
      .subtract(this.cutoffLagDays, 'days')
      .toDate();

    if (adjustedLatestRecordCutoff > currentCutoff) {
      const newState = {
        cutoff: adjustedLatestRecordCutoff.getTime(),
      };
      return {
        ...currentStreamState,
        [key]: newState,
      };
    }
    return currentStreamState;
  }
}