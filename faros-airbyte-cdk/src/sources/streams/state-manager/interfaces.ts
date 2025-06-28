import {Dictionary} from 'ts-essentials';

/**
 * Generic interface for extracting cursor field values from records
 */
export interface FieldExtractor<TRecord, TFieldValue> {
  extract(record: TRecord): TFieldValue;
}

/**
 * Generic interface for generating state keys from stream slices
 */
export interface KeyGenerator<TSlice> {
  generateKey(slice: TSlice): string;
}

/**
 * Generic interface for managing stream state
 */
export interface StateManager<TState, TRecord, TSlice> {
  /**
   * Update stream state based on the latest record
   */
  getUpdatedState(
    currentStreamState: TState,
    latestRecord: TRecord,
    slice: TSlice
  ): TState;
}

/**
 * Configuration for timestamp-based state management
 */
export interface TimestampStateConfig<TRecord, TSlice> {
  /** Extractor for getting timestamp field from records */
  fieldExtractor: FieldExtractor<TRecord, Date | string | number>;
  /** Generator for creating state keys from slices */
  keyGenerator: KeyGenerator<TSlice>;
  /** Optional cutoff lag in days for timestamp adjustment */
  cutoffLagDays?: number;
}

/**
 * Standard stream state structure used across most Airbyte streams
 */
export interface StreamState {
  readonly [key: string]: {
    cutoff: number;
  };
}