import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {AirbyteLogger, AirbyteStreamBase} from '../..';
import {calculateUpdatedStreamState, StreamState} from './stream-base';

/**
 * Abstract base class for streams that support incremental sync with slice-based state management.
 * This class centralizes the common logic for handling incremental state that is currently
 * repeated across many sources.
 * 
 * @template TState The type of the stream state
 * @template TRecord The type of records produced by the stream
 * @template TSlice The type of stream slices used for partitioning
 */
export abstract class IncrementalStreamBase<
  TState = Dictionary<any>,
  TRecord = Dictionary<any>,
  TSlice = Dictionary<any>
> extends AirbyteStreamBase {
  constructor(protected readonly logger: AirbyteLogger) {
    super(logger);
  }

  /**
   * Extract the cursor value (cutoff timestamp) from a record.
   * Default implementation uses the cursorField property to navigate the record structure.
   * Override this method if you need custom cursor extraction logic.
   * 
   * @param record The record to extract the cursor value from
   * @returns The cursor value as a Date, or null if not found
   */
  protected getCursorValue(record: TRecord): Date | null {
    if (!this.cursorField || this.cursorField.length === 0) {
      return null;
    }

    const cursorPath = Array.isArray(this.cursorField) ? this.cursorField : [this.cursorField];
    let value: any = record;
    
    for (const key of cursorPath) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return null;
      }
    }

    return Utils.toDate(value ?? 0) ?? null;
  }

  /**
   * Generate a unique state key for the given stream slice.
   * This key is used to store and retrieve state for each slice independently.
   * 
   * For non-sliced streams, this can return a constant value like the stream name.
   * For sliced streams (e.g., per repository, per project), this should return
   * a unique identifier for the slice.
   * 
   * @param streamSlice The current stream slice being processed
   * @returns A unique string identifier for the slice
   */
  protected abstract getStateKey(streamSlice?: TSlice): string;

  /**
   * Get the number of days to lag the cutoff timestamp.
   * This can be useful for ensuring data consistency when the source system
   * has eventual consistency or when you want to re-process recent data.
   * 
   * @returns Number of days to subtract from the cutoff timestamp
   */
  protected getCutoffLagDays(): number {
    return 0;
  }

  /**
   * Implementation of getUpdatedState that orchestrates the state update process.
   * This method should not be overridden. Instead, override the protected methods
   * that this method calls (getCursorValue, getStateKey, getCutoffLagDays).
   */
  getUpdatedState(
    currentStreamState: TState,
    latestRecord: TRecord,
    streamSlice?: TSlice
  ): TState {
    const cursorValue = this.getCursorValue(latestRecord);
    if (!cursorValue) {
      return currentStreamState ?? ({} as TState);
    }

    const stateKey = this.getStateKey(streamSlice);
    const cutoffLagDays = this.getCutoffLagDays();

    return calculateUpdatedStreamState(
      cursorValue,
      currentStreamState as StreamState,
      stateKey,
      cutoffLagDays
    ) as TState;
  }
}
