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

export function bucket(key: string, data: string, bucketTotal: number): number {
  const md5 = createHmac('md5', key);
  md5.update(data);
  const hex = md5.digest('hex').substring(0, 8);
  return (parseInt(hex, 16) % bucketTotal) + 1; // 1-index for readability
}

export function validateBucketingConfig(config: RoundRobinConfig): void {
  const bucketTotal = config.bucket_total ?? 1;
  const bucketId = config.bucket_id ?? 1;

  if (bucketTotal < 1) {
    throw new VError('bucket_total must be a positive integer');
  }
  if (bucketId < 1 || bucketId > bucketTotal) {
    throw new VError(`bucket_id must be between 1 and ${bucketTotal}`);
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
