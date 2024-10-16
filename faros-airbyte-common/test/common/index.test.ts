import {
  calculateDateRange,
  collectReposByOrg,
  nextBucketId,
} from '../../src/common';

describe('calculateDateRange', () => {
  const logger = jest.fn();

  beforeEach(() => {
    logger.mockClear();
  });

  it('should calculate date range with start and end date', () => {
    const result = calculateDateRange({
      start_date: '2022-01-01',
      end_date: '2022-01-31',
      logger,
    });

    expect(result).toMatchSnapshot();
    expect(logger).toHaveBeenCalledWith(
      `Will process data from ${result.startDate} to ${result.endDate}`
    );
  });

  it('should calculate date range with end date and cutoff days', () => {
    const result = calculateDateRange({
      end_date: '2022-01-31',
      cutoff_days: 10,
      logger,
    });

    expect(result).toMatchSnapshot();
    expect(logger).toHaveBeenCalledWith(
      'Cutoff days provided, calculating start date from end date'
    );
  });

  it('should calculate date range with current date as end date if not provided', () => {
    const result = calculateDateRange({
      start_date: '2022-01-01',
      logger,
    });

    expect(result.startDate).toMatchSnapshot();
    expect(result.endDate).toBeDefined();
    expect(logger).toHaveBeenCalledWith(
      'End date not provided, using current date'
    );
  });

  it('should throw error if start date is after end date', () => {
    expect(() =>
      calculateDateRange({
        start_date: '2022-02-01',
        end_date: '2022-01-31',
        logger,
      })
    ).toThrow(/Start date: .* is after end date: .*/);
  });

  it('should throw error if neither start date nor cutoff days are provided', () => {
    expect(() =>
      calculateDateRange({
        end_date: '2022-01-31',
        logger,
      })
    ).toThrow('Either start_date or cutoff_days must be provided');
  });

  it('should throw error if both start date and cutoff days are provided', () => {
    calculateDateRange({
      start_date: '2022-01-01',
      cutoff_days: 10,
      logger,
    });
    expect(logger).toHaveBeenCalledWith(
      'Both start date and cutoff days provided, discarding cutoff days'
    );
  });
});

describe('collectReposByOrg', () => {
  let reposByOrg;

  beforeEach(() => {
    reposByOrg = new Map();
  });

  test('should add a single repo to the correct namespace', () => {
    const repos = ['apache/kafka'];
    collectReposByOrg(reposByOrg, repos);
    expect(reposByOrg).toMatchSnapshot();
  });

  test('should add multiple repos to the correct namespaces', () => {
    const repos = ['apache/kafka', 'apache/spark', 'facebook/react'];
    collectReposByOrg(reposByOrg, repos);
    expect(reposByOrg).toMatchSnapshot();
  });

  test('should throw an error if repo does not match org/repo format', () => {
    const repos = ['apachekafka'];
    expect(() => collectReposByOrg(reposByOrg, repos)).toThrow(
      'Bad repository provided: apachekafka. Must match org/repo format, e.g apache/kafka'
    );
  });

  test('should throw an error if repo is missing a namespace', () => {
    const repos = ['/kafka'];
    expect(() => collectReposByOrg(reposByOrg, repos)).toThrow(
      'Bad repository provided: /kafka. Must match org/repo format, e.g apache/kafka'
    );
  });

  test('should throw an error if repo is missing a name', () => {
    const repos = ['apache/'];
    expect(() => collectReposByOrg(reposByOrg, repos)).toThrow(
      'Bad repository provided: apache/. Must match org/repo format, e.g apache/kafka'
    );
  });

  test('should not overwrite existing repos in the same namespace', () => {
    const repos = ['apache/kafka'];
    collectReposByOrg(reposByOrg, repos);
    const moreRepos = ['apache/spark'];
    collectReposByOrg(reposByOrg, moreRepos);
    expect(reposByOrg).toMatchSnapshot();
  });

  test('should handle an empty array of repositories', () => {
    const repos = [];
    collectReposByOrg(reposByOrg, repos);
    expect(reposByOrg).toMatchSnapshot();
  });
});

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
