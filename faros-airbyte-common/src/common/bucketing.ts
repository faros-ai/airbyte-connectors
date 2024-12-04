import {createHmac} from 'crypto';
import VError from 'verror';

export function bucket(key: string, data: string, bucketTotal: number): number {
  const md5 = createHmac('md5', key);
  md5.update(data);
  const hex = md5.digest('hex').substring(0, 8);
  return (parseInt(hex, 16) % bucketTotal) + 1; // 1-index for readability
}

export function validateBucketingConfig(
  bucketId: number = 1,
  bucketTotal: number = 1
): void {
  if (bucketTotal < 1) {
    throw new VError('bucket_total must be a positive integer');
  }
  if (bucketId < 1 || bucketId > bucketTotal) {
    throw new VError(`bucket_id must be between 1 and ${bucketTotal}`);
  }
}

export function nextBucketId(
  config: {bucket_total?: number},
  state?: {__bucket_execution_state?: {last_executed_bucket_id?: number}}
): number {
  const bucketTotal = config.bucket_total ?? 1;
  const lastExecutedBucketId =
    state?.__bucket_execution_state?.last_executed_bucket_id ?? bucketTotal;

  return (lastExecutedBucketId % bucketTotal) + 1;
}
