import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import * as sut from '../src/index';
import {Statuspage} from '../src/statuspage';

const statusPageInstance = Statuspage.instance;

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

  beforeEach(() => {
    Statuspage.instance = statusPageInstance;
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('spec', async () => {
    const source = new sut.StatuspageSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  const sourceConfig = {
    api_key: '',
    page_ids: ['n3wb7hf336hn', 'mz1ms2kfwq1s'],
    cutoff_days: 90,
    org_id: 'org_id',
  };

  test('check connection', async () => {
    Statuspage.instance = jest.fn().mockImplementation(() => {
      return new Statuspage(
        {get: jest.fn().mockResolvedValue({})} as any,
        new Date('2010-03-27T14:03:51-0800'),
        logger
      );
    });

    const source = new sut.StatuspageSource(logger);
    await expect(source.checkConnection(sourceConfig)).resolves.toStrictEqual([
      true,
      undefined,
    ]);
  });

  test('check connection - incorrect page_id', async () => {
    Statuspage.instance = jest.fn().mockImplementation(() => {
      return new Statuspage(
        {get: jest.fn().mockRejectedValue(new Error('some error'))} as any,
        new Date('2010-03-27T14:03:51-0800'),
        logger
      );
    });
    const source = new sut.StatuspageSource(logger);
    await expect(source.checkConnection(sourceConfig)).resolves.toStrictEqual([
      false,
      new VError('Please verify your token is correct. Error: some error'),
    ]);
  });

  test('check connection - incorrect variables', async () => {
    const source = new sut.StatuspageSource(logger);
    await expect(source.checkConnection(sourceConfig)).resolves.toStrictEqual([
      false,
      new VError('api_key must not be an empty string'),
    ]);
  });

  test('streams - incidents, use full_refresh sync mode', async () => {
    const fnIncidentsFunc = jest.fn();

    Statuspage.instance = jest.fn().mockImplementation(() => {
      return new Statuspage(
        {
          get: fnIncidentsFunc.mockResolvedValue({
            data: readTestResourceFile('incidents.json'),
          }),
        } as any,
        new Date('1970-01-01T00:00:00-0000'),
        logger
      );
    });
    const source = new sut.StatuspageSource(logger);
    const streams = source.streams(sourceConfig);

    const incidentsStream = streams[0];
    const incidentsIter = incidentsStream.readRecords(
      SyncMode.FULL_REFRESH,
      null,
      {pageId: 'page_id'}
    );
    const incidents = [];
    for await (const incident of incidentsIter) {
      incidents.push(incident);
    }

    expect(fnIncidentsFunc).toHaveBeenCalledTimes(1);
    expect(incidents).toStrictEqual(readTestResourceFile('incidents.json'));
  });

  test('streams - pages, use full_refresh sync mode', async () => {
    const fnPagesFunc = jest.fn();

    Statuspage.instance = jest.fn().mockImplementation(() => {
      return new Statuspage(
        {
          get: fnPagesFunc.mockResolvedValue({
            data: readTestResourceFile('pages.json'),
          }),
        } as any,
        new Date('1970-01-01T00:00:00-0000'),
        logger
      );
    });
    const source = new sut.StatuspageSource(logger);
    const streams = source.streams(sourceConfig);

    const pagesStream = streams[1];
    const pagesIter = pagesStream.readRecords(SyncMode.FULL_REFRESH);
    const pages = [];
    for await (const page of pagesIter) {
      pages.push(page);
    }

    expect(fnPagesFunc).toHaveBeenCalledTimes(1);
    expect(pages).toStrictEqual(readTestResourceFile('pages.json'));
  });

  test('streams - users, use full_refresh sync mode', async () => {
    const fnUsersFunc = jest.fn();
    const sp = new Statuspage(
      {
        get: fnUsersFunc.mockResolvedValueOnce({
          data: readTestResourceFile('users.json'),
        }),
      } as any,
      new Date('1970-01-01T00:00:00-0000'),
      logger
    );
    Statuspage.instance = jest.fn().mockReturnValue(sp);
    const source = new sut.StatuspageSource(logger);
    const streams = source.streams(sourceConfig);

    const usersStream = streams[2];
    const usersIter = usersStream.readRecords(SyncMode.FULL_REFRESH);
    const users = [];
    for await (const user of usersIter) {
      users.push(user);
    }

    expect(fnUsersFunc).toHaveBeenCalledTimes(1);
    expect(users).toStrictEqual(readTestResourceFile('users.json'));
  });
});
