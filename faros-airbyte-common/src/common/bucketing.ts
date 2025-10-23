import {createHmac} from 'crypto';
import VError from 'verror';

import {BucketSet} from './bucket-set';

export interface BucketExecutionState {
  __bucket_execution_state?: {
    last_executed_bucket_id: number;
  };
  [key: string]: any;
}

export interface RoundRobinConfig {
  round_robin_bucket_execution?: boolean;
  bucket_id?: number;
  bucket_ranges?: string | ReadonlyArray<string>;
  bucket_total?: number;
  [key: string]: any;
}

export function bucket(
  key: string,
  data: string,
  bucketTotal: number = 1
): number {
  const md5 = createHmac('md5', key);
  md5.update(data);
  const hex = md5.digest('hex').substring(0, 8);
  return (parseInt(hex, 16) % bucketTotal) + 1; // 1-index for readability
}

export function validateBucketingConfig(
  config: RoundRobinConfig,
  logger?: (message: string) => void
): void {
  const bucketTotal = config.bucket_total ?? 1;
  const bucketId = config.bucket_id ?? 1;

  if (bucketTotal < 1) {
    throw new VError('bucket_total must be a positive integer');
  }
  if (bucketId < 1 || bucketId > bucketTotal) {
    throw new VError(`bucket_id must be between 1 and ${bucketTotal}`);
  }

  if (config.bucket_ranges) {
    if (!config.round_robin_bucket_execution) {
      logger?.(
        `bucket_ranges ${config.bucket_ranges} ignored because round_robin_bucket_execution is not enabled`
      );
    } else {
      new BucketSet(bucketTotal, config.bucket_ranges);
    }
  }
}

export function nextBucketId(
  config: RoundRobinConfig,
  state?: BucketExecutionState
): number {
  const bucketTotal = config.bucket_total ?? 1;
  const lastExecutedBucketId =
    state?.__bucket_execution_state?.last_executed_bucket_id ?? bucketTotal;

  if (config.round_robin_bucket_execution && config.bucket_ranges) {
    const bucketSet = new BucketSet(bucketTotal, config.bucket_ranges);
    return bucketSet.next(lastExecutedBucketId);
  }

  return (lastExecutedBucketId % bucketTotal) + 1;
}

export function applyRoundRobinBucketing(
  config: RoundRobinConfig,
  state?: BucketExecutionState,
  logger?: (message: string) => void
): {config: RoundRobinConfig; state: BucketExecutionState} {
  if (!config.round_robin_bucket_execution) {
    return {config, state};
  }

  const next = nextBucketId(config, state);
  logger?.(`Using round robin bucket execution. Bucket id: ${next}`);

  return {
    config: {
      ...config,
      bucket_id: next,
    },
    state: {
      ...state,
      __bucket_execution_state: {
        last_executed_bucket_id: next,
      },
    },
  };
}

/**
 * Unified bucketing manager that handles validation, round-robin, and filtering.
 *
 * This class encapsulates all bucketing concerns in one place:
 * - Validates bucketing configuration
 * - Applies round-robin bucket execution if enabled
 * - Provides simple filtering methods
 * - Manages state for persistence
 *
 * @example
 * ```typescript
 * // Create manager (validates and applies round-robin automatically)
 * const bucketing = Bucketing.create(
 *   'farosai/airbyte-gitlab-source',
 *   config,
 *   state,
 *   logger
 * );
 *
 * // Filter items
 * const filtered = bucketing.filter(items, item => item.key);
 *
 * // Get state for persistence
 * const newState = bucketing.getState();
 * ```
 */
export class Bucketing {
  private readonly partitionKey: string;
  private readonly bucketId: number;
  private readonly bucketTotal: number;
  private readonly state: BucketExecutionState;

  private constructor(
    partitionKey: string,
    bucketId: number,
    bucketTotal: number,
    state?: BucketExecutionState
  ) {
    this.partitionKey = partitionKey;
    this.bucketId = bucketId;
    this.bucketTotal = bucketTotal;
    this.state = state ?? {};
  }

  /**
   * Create and initialize bucketing manager.
   * Automatically validates config and applies round-robin if enabled.
   *
   * @param partitionKey - Unique key for this connector (e.g., 'farosai/airbyte-gitlab-source')
   * @param config - Configuration with bucketing parameters
   * @param state - Previous state for round-robin execution
   * @param logger - Optional logger function
   * @returns Initialized Bucketing instance
   */
  static create(
    partitionKey: string,
    config: RoundRobinConfig,
    state?: BucketExecutionState,
    logger?: (message: string) => void
  ): Bucketing {
    // Validate configuration
    validateBucketingConfig(config, logger);

    // Apply round-robin bucketing if enabled
    const {config: newConfig, state: newState} = applyRoundRobinBucketing(
      config,
      state,
      logger
    );

    return new Bucketing(
      partitionKey,
      newConfig.bucket_id ?? 1,
      newConfig.bucket_total ?? 1,
      newState
    );
  }

  private static isInBucket(
    key: string,
    data: string,
    bucketId: number,
    bucketTotal: number
  ): boolean {
    return bucket(key, data, bucketTotal) === bucketId;
  }

  /**
   * Filter an array of items based on bucketing.
   *
   * @param items - Array of items to filter
   * @param getKey - Function to extract the partition key from each item
   * @returns Filtered array containing only items in this bucket
   */
  filter<T>(
    items: ReadonlyArray<T>,
    getKey: (item: T) => string
  ): ReadonlyArray<T> {
    return items.filter((item) =>
      Bucketing.isInBucket(
        this.partitionKey,
        getKey(item),
        this.bucketId,
        this.bucketTotal
      )
    );
  }

  /**
   * Get updated state for persistence.
   * This state should be saved and passed to the next sync run.
   *
   * @returns State object with bucket execution information
   */
  getState(): BucketExecutionState {
    return this.state;
  }

  /**
   * Get current bucket ID being processed.
   *
   * @returns The bucket ID (1-indexed)
   */
  getBucketId(): number {
    return this.bucketId;
  }

  /**
   * Get total number of buckets.
   *
   * @returns The total bucket count
   */
  getBucketTotal(): number {
    return this.bucketTotal;
  }
}
