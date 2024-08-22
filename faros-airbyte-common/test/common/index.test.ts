import {calculateDateRange, collectReposByOrg} from '../../src/common';

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
