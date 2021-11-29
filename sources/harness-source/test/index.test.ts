import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import {Harness} from '../src/harness';
import * as sut from '../src/index';

function readTestResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
}

describe('index', () => {
  const logger = new AirbyteLogger(
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
      new AirbyteSpec(readTestResourceFile('spec.json'))
    );
  });

  test('check connection - if config params are not provided', async () => {
    const source = new sut.HarnessSource(logger);
    await expect(source.checkConnection({} as any)).resolves.toStrictEqual([
      false,
      new VError(
        "Missing authentication information. Please provide a Harness user's accountId"
      ),
    ]);
    await expect(
      source.checkConnection({account_id: '111'})
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
        logger
      );
    });
    const source = new sut.HarnessSource(logger);
    await expect(
      source.checkConnection({
        account_id: 'account_id',
        api_key: 'api_key',
      })
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('check connection - incorrect config parameters', async () => {
    Harness.instance = jest.fn().mockImplementation(() => {
      return new Harness(
        {
          request: jest.fn().mockRejectedValue({}),
        } as any,
        100,
        logger
      );
    });
    const source = new sut.HarnessSource(logger);
    await expect(
      source.checkConnection({
        account_id: 'account_id',
        api_key: 'api_key',
      })
    ).resolves.toStrictEqual([
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
        logger
      );
    });

    const source = new sut.HarnessSource(logger);
    const [executionsStream] = source.streams({
      account_id: 'account_id',
      api_key: 'api_key',
    });
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
        logger
      );
    });

    const source = new sut.HarnessSource(logger);
    const [executionsStream] = source.streams({
      account_id: 'account_id',
      api_key: 'api_key',
    });
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
