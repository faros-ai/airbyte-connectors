import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  SyncMode,
  readResourceFile,
  readResourceAsJSON,
  readTestResourceFile,
  readTestResourceAsJSON,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import {Harness} from '../src/harness';
import * as sut from '../src/index';


describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('spec', async () => {
    const source = new sut.HarnessSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  const sourceConfig = {account_id: '111', api_key: 'key', cutoff_days: 90};

  test('check connection - if config params are not provided', async () => {
    const source = new sut.HarnessSource(logger);
    await expect(
      source.checkConnection({api_key: '', cutoff_days: 90, account_id: null})
    ).resolves.toStrictEqual([
      false,
      new VError(
        "Missing authentication information. Please provide a Harness user's accountId"
      ),
    ]);
    await expect(
      source.checkConnection({cutoff_days: 90, api_key: null, account_id: 'id'})
    ).resolves.toStrictEqual([
      false,
      new VError(
        'Missing authentication information. Please provide a Harness apiKey'
      ),
    ]);
  });

  test('check connection', async () => {
    Harness.instance = jest.fn().mockImplementation(() => {
      return new Harness(
        {
          request: jest.fn().mockResolvedValue({}),
        } as any,
        100,
        new Date('2010-03-27T14:03:51-0800'),
        logger
      );
    });
    const source = new sut.HarnessSource(logger);
    await expect(source.checkConnection(sourceConfig)).resolves.toStrictEqual([
      true,
      undefined,
    ]);
  });

  test('check connection - incorrect config parameters', async () => {
    Harness.instance = jest.fn().mockImplementation(() => {
      return new Harness(
        {
          request: jest.fn().mockRejectedValue({}),
        } as any,
        100,
        new Date('2010-03-27T14:03:51-0800'),
        logger
      );
    });
    const source = new sut.HarnessSource(logger);
    await expect(source.checkConnection(sourceConfig)).resolves.toStrictEqual([
      false,
      new VError('Please verify your API ID or key are correct. Error: '),
    ]);
  });

  test('streams - executions, use full_refresh sync mode', async () => {
    const fnExecutions = jest.fn();

    Harness.instance = jest.fn().mockImplementation(() => {
      return new Harness(
        {
          request: fnExecutions.mockResolvedValue({
            executions: {
              nodes: readTestResourceFile('executions.json'),
              pageInfo: {
                limit: 2,
                hasMore: false,
              },
            },
          }),
        } as any,
        100,
        new Date('2010-03-27T14:03:51-0800'),
        logger
      );
    });

    const source = new sut.HarnessSource(logger);
    const [executionsStream] = source.streams(sourceConfig);
    const executionsIter = executionsStream.readRecords(SyncMode.FULL_REFRESH);
    const executions = [];
    for await (const execution of executionsIter) {
      executions.push(execution);
    }
    expect(fnExecutions).toHaveBeenCalledTimes(1);
    expect(executions).toStrictEqual(readTestResourceFile('executions.json'));
  });

  test('streams - executions, use incremental sync mode', async () => {
    const fnExecutions = jest.fn();

    Harness.instance = jest.fn().mockImplementation(() => {
      return new Harness(
        {
          request: fnExecutions.mockResolvedValue({
            executions: {
              nodes: readTestResourceFile('executions.json'),
              pageInfo: {
                limit: 2,
                hasMore: false,
              },
            },
          }),
        } as any,
        100,
        new Date('2010-03-27T14:03:51-0800'),
        logger
      );
    });

    const source = new sut.HarnessSource(logger);
    const [executionsStream] = source.streams(sourceConfig);
    const executionsIter = executionsStream.readRecords(
      SyncMode.INCREMENTAL,
      undefined,
      undefined,
      {lastEndedAt: 1735718400000}
    );
    const executions = [];
    for await (const execution of executionsIter) {
      executions.push(execution);
    }
    expect(fnExecutions).toHaveBeenCalledTimes(1);
    expect(executions).toStrictEqual([]);
  });
});
