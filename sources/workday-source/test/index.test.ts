import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import * as sut from '../src/index';
import {Workday} from '../src/workday';

function readResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
}

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

  const config = readTestResourceFile('config.json');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('spec', async () => {
    const source = new sut.WorkdaySource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection - if config params are not provided', async () => {
    const source = new sut.WorkdaySource(logger);
    await expect(source.checkConnection({} as any)).resolves.toStrictEqual([
      false,
      new VError('tenant must not be an empty string'),
    ]);
    await expect(
      source.checkConnection({
        ...config,
        clientId: '',
      })
    ).resolves.toStrictEqual([
      false,
      new VError('clientId must not be an empty string'),
    ]);
    await expect(
      source.checkConnection({
        ...config,
        clientSecret: '',
      })
    ).resolves.toStrictEqual([
      false,
      new VError('clientSecret must not be an empty string'),
    ]);
    await expect(
      source.checkConnection({
        ...config,
        refreshToken: '',
      })
    ).resolves.toStrictEqual([
      false,
      new VError('refreshToken must not be an empty string'),
    ]);
  });

  test('check connection', async () => {
    Workday.instance = jest.fn().mockImplementation(() => {
      return new Workday(
        logger,
        {
          get: jest.fn().mockResolvedValue({
            data: readTestResourceFile('workers.json'),
          }),
        } as any,
        20,
        'base-url'
      );
    });
    const source = new sut.WorkdaySource(logger);
    await expect(source.checkConnection(config)).resolves.toStrictEqual([
      true,
      undefined,
    ]);
  });

  test('streams - orgs', async () => {
    const fnListOrgs = jest.fn();
    const expected = readTestResourceFile('orgs.json');
    const limit = 2;

    Workday.instance = jest.fn().mockImplementation(() => {
      return new Workday(
        logger,
        {
          get: fnListOrgs.mockResolvedValue({data: expected}),
        } as any,
        limit,
        'base-url'
      );
    });

    const source = new sut.WorkdaySource(logger);
    const orgs = source.streams(config)[1];
    const iter = orgs.readRecords(SyncMode.FULL_REFRESH);
    const items = [];
    for await (const item of iter) {
      items.push(item);
    }
    expect(fnListOrgs).toHaveBeenCalledTimes(limit);
    expect(items).toStrictEqual([...expected.data, ...expected.data]);
  });

  test('streams - people', async () => {
    const fnListOrgs = jest.fn();
    const expected = readTestResourceFile('people.json');
    const limit = 2;

    Workday.instance = jest.fn().mockImplementation(() => {
      return new Workday(
        logger,
        {
          get: fnListOrgs.mockResolvedValue({data: expected}),
        } as any,
        limit,
        'base-url'
      );
    });

    const source = new sut.WorkdaySource(logger);
    const people = source.streams(config)[2];
    const iter = people.readRecords(SyncMode.FULL_REFRESH);
    const items = [];
    for await (const item of iter) {
      items.push(item);
    }
    expect(fnListOrgs).toHaveBeenCalledTimes(limit);
    expect(items).toStrictEqual([...expected.data, ...expected.data]);
  });

  test('streams - workers', async () => {
    const fnListOrgs = jest.fn();
    const expected = readTestResourceFile('workers.json');
    const limit = 2;

    Workday.instance = jest.fn().mockImplementation(() => {
      return new Workday(
        logger,
        {
          get: fnListOrgs.mockResolvedValue({data: expected}),
        } as any,
        limit,
        'base-url'
      );
    });

    const source = new sut.WorkdaySource(logger);
    const workers = source.streams(config)[3];
    const iter = workers.readRecords(SyncMode.FULL_REFRESH);
    const items = [];
    for await (const item of iter) {
      items.push(item);
    }
    expect(fnListOrgs).toHaveBeenCalledTimes(limit);
    expect(items).toStrictEqual([...expected.data, ...expected.data]);
  });
  test('streams - customReports', async () => {
    const fnListOrgs = jest.fn();
    const expected = readTestResourceFile('customReports.json');
    const limit = 2;

    Workday.instance = jest.fn().mockImplementation(() => {
      return new Workday(
        logger,
        {
          get: fnListOrgs.mockResolvedValue({data: expected}),
        } as any,
        limit,
        'base-url'
      );
    });

    const source = new sut.WorkdaySource(logger);
    const workers = source.streams(config)[3];
    const iter = workers.readRecords(SyncMode.FULL_REFRESH);
    const items = [];
    for await (const item of iter) {
      items.push(item);
    }
    expect(fnListOrgs).toHaveBeenCalledTimes(limit);
    expect(items).toStrictEqual([...expected.data, ...expected.data]);
  });
});
