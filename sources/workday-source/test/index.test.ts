import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  SyncMode
} from 'faros-airbyte-cdk';
import {
  readResourceAsJSON,
  readTestFileAsJSON
} from 'faros-airbyte-testing-tools';
import {VError} from 'verror';

import * as sut from '../src/index';
import {Workday} from '../src/workday';

const test_base_url = 'https://testurl.com';

function getWorkdayInstance(logger, axios_instance, limit): Workday {
  return new Workday(
    logger,
    axios_instance,
    limit,
    test_base_url,
    'acme',
    true
  );
}

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const config_tkn = readTestFileAsJSON('config_tokens.json');
  const config_unpw = readTestFileAsJSON('config_unpw.json');
  const config_unpw_csv = readTestFileAsJSON('config_unpw_csv.json');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('spec', async () => {
    const source = new sut.WorkdaySource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceAsJSON('spec.json'))
    );
  });

  test('check connection - if config params are not provided', async () => {
    const source = new sut.WorkdaySource(logger);
    await expect(source.checkConnection({} as any)).resolves.toStrictEqual([
      false,
      new VError(
        'Connection check failed.: tenant must not be an empty string'
      ),
    ]);
    await expect(
      source.checkConnection({
        ...config_tkn,
        credentials: '',
      })
    ).resolves.toStrictEqual([
      false,
      new VError('Connection check failed.: credentials must not be empty'),
    ]);
  });

  test('check token connection', async () => {
    Workday.instance = jest.fn().mockImplementation(() => {
      return getWorkdayInstance(
        logger,
        {
          get: jest.fn().mockResolvedValue({
            data: readTestFileAsJSON('workers.json'),
          }),
        } as any,
        20
      );
    });
    const source = new sut.WorkdaySource(logger);
    await expect(source.checkConnection(config_tkn)).resolves.toStrictEqual([
      true,
      undefined,
    ]);
  });

  test('check un/pw connection', async () => {
    Workday.instance = jest.fn().mockImplementation(() => {
      return getWorkdayInstance(
        logger,
        {
          get: jest.fn().mockResolvedValue({
            data: readTestFileAsJSON('workers.json'),
          }),
        } as any,
        20
      );
    });
    const source = new sut.WorkdaySource(logger);
    await expect(source.checkConnection(config_unpw)).resolves.toStrictEqual([
      true,
      undefined,
    ]);
  });

  test('streams - orgs', async () => {
    const fnListOrgs = jest.fn();
    const expected = readTestFileAsJSON('orgs.json');
    const limit = 2;

    Workday.instance = jest.fn().mockImplementation(() => {
      return getWorkdayInstance(
        logger,
        {
          get: fnListOrgs.mockResolvedValue({data: expected}),
        } as any,
        limit
      );
    });

    const source = new sut.WorkdaySource(logger);
    const orgs = source.streams(config_tkn)[1];
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
    const expected = readTestFileAsJSON('people.json');
    const limit = 2;

    Workday.instance = jest.fn().mockImplementation(() => {
      return getWorkdayInstance(
        logger,
        {
          get: fnListOrgs.mockResolvedValue({data: expected}),
        } as any,
        limit
      );
    });

    const source = new sut.WorkdaySource(logger);
    const people = source.streams(config_tkn)[2];
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
    const expected = readTestFileAsJSON('workers.json');
    const limit = 2;

    Workday.instance = jest.fn().mockImplementation(() => {
      return getWorkdayInstance(
        logger,
        {
          get: fnListOrgs.mockResolvedValue({data: expected}),
        } as any,
        limit
      );
    });

    const source = new sut.WorkdaySource(logger);
    const workers = source.streams(config_tkn)[3];
    const iter = workers.readRecords(SyncMode.FULL_REFRESH);
    const items = [];
    for await (const item of iter) {
      items.push(item);
    }
    expect(fnListOrgs).toHaveBeenCalledTimes(limit);
    expect(items).toStrictEqual([...expected.data, ...expected.data]);
  });
  test('streams - customReports (json)', async () => {
    const fnCustomreports = jest.fn();
    const expected = readTestFileAsJSON('customreports.json');

    Workday.instance = jest.fn().mockImplementation(() => {
      return new Workday(
        logger,
        {
          get: fnCustomreports.mockResolvedValue({data: expected}),
        } as any,
        0,
        test_base_url,
        'my_tenant',
        true
      );
    });

    const source = new sut.WorkdaySource(logger);
    const workers = source.streams(config_unpw)[4];
    const iter = workers.readRecords(SyncMode.FULL_REFRESH);
    const items = [];
    for await (const item of iter) {
      items.push(item);
    }
    expect(fnCustomreports).toHaveBeenCalledTimes(1);
    expect(items).toStrictEqual(expected.Report_Entry);
  });

  test('streams - customReports (csv)', async () => {
    const fnCustomreports = jest.fn();
    const expected = readTestFileAsJSON('customreports.json');
    const csv_data = readTestFileAsJSON('customreports_csv.json');

    Workday.instance = jest.fn().mockImplementation(() => {
      return new Workday(
        logger,
        {
          get: fnCustomreports.mockResolvedValue(csv_data),
        } as any,
        0,
        test_base_url,
        'my_tenant',
        true
      );
    });

    const source = new sut.WorkdaySource(logger);
    const workers = source.streams(config_unpw_csv)[4];
    const iter = workers.readRecords(SyncMode.FULL_REFRESH);
    const items = [];
    for await (const item of iter) {
      items.push(item);
    }
    expect(fnCustomreports).toHaveBeenCalledTimes(1);
    expect(items).toStrictEqual(expected.Report_Entry);
  });
});
