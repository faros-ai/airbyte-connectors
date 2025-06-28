import {TimestampStateConfig} from './interfaces';
import {TimestampStateManager} from './timestamp-state-manager';

/**
 * Factory class for creating state managers with custom configuration
 */
export class StateManagerFactory {
  /**
   * Create state manager with custom configuration
   */
  static create<TRecord, TSlice>(
    config: TimestampStateConfig<TRecord, TSlice>
  ): TimestampStateManager<TRecord, TSlice> {
    return new TimestampStateManager(config);
  }
}