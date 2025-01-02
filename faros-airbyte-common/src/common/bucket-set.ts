import VError from 'verror';

export class BucketSet {
  private readonly sortedBuckets: ReadonlyArray<number>;

  constructor(
    bucketTotal: number,
    bucketRanges: string | ReadonlyArray<string>
  ) {
    if (bucketTotal < 1) {
      throw new VError('bucket_total must be a positive integer');
    }

    const rangeStrings = (
      typeof bucketRanges === 'string' ? bucketRanges.split(',') : bucketRanges
    ).filter((s) => s.trim());

    if (!rangeStrings?.length) {
      throw new VError('bucket_ranges cannot be empty');
    }

    const buckets = new Set<number>();

    for (const range of rangeStrings) {
      const [start, end] = this.parseRange(range);

      if (start < 1 || end > bucketTotal) {
        throw new VError(
          `Invalid bucket range ${range}: values must be between 1 and ${bucketTotal}`
        );
      }

      for (let i = start; i <= end; i++) {
        buckets.add(i);
      }
    }

    this.sortedBuckets = Array.from(buckets).sort((a, b) => a - b);
  }

  private parseRange(range: string): [number, number] {
    const parts = range.split('-').map((p) => p.trim());

    if (parts.length > 2) {
      throw new VError(`Invalid range format: ${range}`);
    }

    const start = parseInt(parts[0]);
    if (isNaN(start)) {
      throw new VError(`Invalid number in range: ${parts[0]}`);
    }

    // If it's a single number, both start and end are the same
    if (parts.length === 1) {
      return [start, start];
    }

    const end = parseInt(parts[1]);
    if (isNaN(end)) {
      throw new VError(`Invalid number in range: ${parts[1]}`);
    }

    if (end < start) {
      throw new VError(`Invalid range ${range}: end cannot be less than start`);
    }

    return [start, end];
  }

  next(bucketId: number): number {
    let low = 0;
    let high = this.sortedBuckets.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.sortedBuckets[mid] <= bucketId) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    if (low < this.sortedBuckets.length) {
      return this.sortedBuckets[low];
    }
    // Wrap around to first bucket if no larger bucket found
    return this.sortedBuckets[0];
  }
}
