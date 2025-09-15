import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
} from 'faros-airbyte-cdk';
import {
  readResourceAsJSON,
  readTestResourceAsJSON,
  sourceCheckTest,
  sourceReadTest,
  sourceSchemaTest,
} from 'faros-airbyte-testing-tools';

import {ClaudeCode} from '../src/claude_code';
import * as sut from '../src/index';

const setupClaudeCodeInstance = (mockMethods: any) => {
  jest
    .spyOn(require('faros-js-client'), 'makeAxiosInstanceWithRetry')
    .mockReturnValue(mockMethods);
};

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const source = new sut.ClaudeCodeSource(logger);

  afterEach(() => {
    jest.restoreAllMocks();
    (ClaudeCode as any).claudeCode = undefined;
  });

  test('spec', async () => {
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceAsJSON('spec.json'))
    );
  });

  test('check connection - valid config', async () => {
    setupClaudeCodeInstance({
      get: jest.fn().mockResolvedValue({data: {data: [], has_more: false}}),
    });
    await sourceCheckTest({
      source,
      configOrPath: 'config.json',
    });
  });

  test('check connection - invalid config', async () => {
    const error = new Error('Invalid API key');
    (error as any).response = {status: 401};
    setupClaudeCodeInstance({
      get: jest.fn().mockRejectedValue(error),
    });
    await sourceCheckTest({
      source,
      configOrPath: 'config.json',
    });
  });

  test('streams - json schema fields', () => {
    sourceSchemaTest(source, readTestResourceAsJSON('config.json'));
  });

  test('streams - usage report', async () => {
    const res = readTestResourceAsJSON('usage_report/usage_report.json');
    // Mock should only return data once (for a single date)
    // The stream will iterate through dates, but only one will have data
    setupClaudeCodeInstance({
      get: jest
        .fn()
        .mockResolvedValueOnce({data: res}) // First date has data
        .mockResolvedValue({data: {data: [], has_more: false}}), // Other dates are empty
    });
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'usage_report/catalog.json',
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - users', async () => {
    const usersRes = readTestResourceAsJSON('users/users.json');

    // Mock only the users API (no dependency on usage reports)
    setupClaudeCodeInstance({
      get: jest.fn().mockResolvedValue({data: usersRes}),
    });

    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'users/catalog.json',
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });
});
