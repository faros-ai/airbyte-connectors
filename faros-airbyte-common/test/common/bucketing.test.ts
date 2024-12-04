import {nextBucketId} from '../../src/common';

describe('getNextBucketId', () => {
  test('should return 1 when bucket_total is 1', () => {
    const config = {bucket_total: 1};
    const state = undefined;
    expect(nextBucketId(config, state)).toBe(1);
  });

  test('should return next bucket id when last_executed_bucket_id is provided', () => {
    const config = {bucket_total: 3};
    expect(
      nextBucketId(config, {
        __bucket_execution_state: {last_executed_bucket_id: 1},
      })
    ).toBe(2);
    expect(
      nextBucketId(config, {
        __bucket_execution_state: {last_executed_bucket_id: 2},
      })
    ).toBe(3);
    expect(
      nextBucketId(config, {
        __bucket_execution_state: {last_executed_bucket_id: 3},
      })
    ).toBe(1);
  });

  test('should wrap around to 1 when reaching the last bucket', () => {
    const config = {bucket_total: 3};
    const state = {__bucket_execution_state: {last_executed_bucket_id: 3}};
    expect(nextBucketId(config, state)).toBe(1);
  });

  test('should use default bucket_total of 1 when not provided', () => {
    const config = {};
    const state = undefined;
    expect(nextBucketId(config, state)).toBe(1);
  });

  test('should use bucket_total as last_executed_bucket_id when state is undefined', () => {
    const config = {bucket_total: 5};
    const state = undefined;
    expect(nextBucketId(config, state)).toBe(1);
  });
});
