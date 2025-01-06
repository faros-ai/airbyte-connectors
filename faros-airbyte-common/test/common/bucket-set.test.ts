import {BucketSet} from '../../src/common/bucket-set';

describe('BucketSet', () => {
  describe('constructor', () => {
    test('should create bucket set with valid ranges', () => {
      expect(() => new BucketSet(5, ['1', '3-5'])).not.toThrow();
      expect(() => new BucketSet(10, ['1-3', '5', '7-8'])).not.toThrow();
      expect(() => new BucketSet(5, '1,3-5')).not.toThrow();
    });

    test('should throw for invalid bucket_total', () => {
      expect(() => new BucketSet(0, ['1'])).toThrow(
        'bucket_total must be a positive integer'
      );
      expect(() => new BucketSet(-1, ['1'])).toThrow(
        'bucket_total must be a positive integer'
      );
    });

    test('should throw for empty bucket ranges', () => {
      expect(() => new BucketSet(5, [])).toThrow(
        'bucket_ranges cannot be empty'
      );
      expect(() => new BucketSet(5, '')).toThrow(
        'bucket_ranges cannot be empty'
      );
    });

    test('should throw for invalid range format', () => {
      expect(() => new BucketSet(5, ['1-2-3'])).toThrow(
        'Invalid range format: 1-2-3'
      );
      expect(() => new BucketSet(5, ['a'])).toThrow(
        'Invalid number in range: a'
      );
      expect(() => new BucketSet(5, ['1-b'])).toThrow(
        'Invalid number in range: b'
      );
    });

    test('should throw for out of bounds ranges', () => {
      expect(() => new BucketSet(5, ['0-1'])).toThrow(
        'Invalid bucket range 0-1: values must be between 1 and 5'
      );
      expect(() => new BucketSet(5, ['6'])).toThrow(
        'Invalid bucket range 6: values must be between 1 and 5'
      );
      expect(() => new BucketSet(5, ['1-6'])).toThrow(
        'Invalid bucket range 1-6: values must be between 1 and 5'
      );
    });

    test('should throw for invalid range order', () => {
      expect(() => new BucketSet(5, ['3-1'])).toThrow(
        'Invalid range 3-1: end cannot be less than start'
      );
    });
  });

  describe('next', () => {
    test('should return next bucket in sequence', () => {
      const bucketSet = new BucketSet(10, ['1-3', '5', '7-8']);
      expect(bucketSet.next(1)).toBe(2);
      expect(bucketSet.next(2)).toBe(3);
      expect(bucketSet.next(3)).toBe(5);
      expect(bucketSet.next(5)).toBe(7);
      expect(bucketSet.next(7)).toBe(8);
    });

    test('should wrap around to first bucket when reaching the end', () => {
      const bucketSet = new BucketSet(10, ['1-3', '5', '7-8']);
      expect(bucketSet.next(8)).toBe(1);
    });

    test('should handle single bucket range', () => {
      const bucketSet = new BucketSet(5, ['3']);
      expect(bucketSet.next(1)).toBe(3);
      expect(bucketSet.next(3)).toBe(3);
    });

    test('should handle non-consecutive ranges', () => {
      const bucketSet = new BucketSet(10, '2,4,6,8');
      expect(bucketSet.next(2)).toBe(4);
      expect(bucketSet.next(4)).toBe(6);
      expect(bucketSet.next(6)).toBe(8);
      expect(bucketSet.next(8)).toBe(2);
    });

    test('should handle bucket id not in set', () => {
      const bucketSet = new BucketSet(10, ['2-4', '7-8']);
      expect(bucketSet.next(1)).toBe(2);
      expect(bucketSet.next(5)).toBe(7);
      expect(bucketSet.next(9)).toBe(2);
    });
  });
});
