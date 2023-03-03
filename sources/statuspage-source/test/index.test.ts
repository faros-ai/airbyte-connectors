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
  });

  test('spec', async () => {
    const source = new sut.StatuspageSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  const sourceConfig = {api_key: '', page_id: 'page_id', cutoff_days: 90};

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
      new VError('Please verify your token are correct. Error: some error'),
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
          get: jest.fn().mockResolvedValue({
            incidents: readTestResourceFile('incidents.json'),
          }),
        } as any,
        new Date('1970-01-01T00:00:00-0000'),
        logger
      );
    });
    const source = new sut.StatuspageSource(logger);
    const streams = source.streams(sourceConfig);

    const incidentsStream = streams[0];
    const incidentsIter = incidentsStream.readRecords(SyncMode.FULL_REFRESH);
    const incidents = [];
    for await (const incident of incidentsIter) {
      incidents.push(incident);
    }

    expect(fnIncidentsFunc).toHaveBeenCalledTimes(1);
    expect(incidents).toStrictEqual(readTestResourceFile('incidents.json'));
  });

  test('streams - incidentUpdates, use incremental sync mode', async () => {
    const mockFunc = jest.fn();

    Statuspage.instance = jest.fn().mockImplementation(() => {
      return new Statuspage(
        {
          get: jest.fn().mockResolvedValue({
            incidents: readTestResourceFile('incidents.json'),
          }),
        } as any,
        new Date('2010-03-27T14:03:51-0800'),
        logger
      );
    });
    const source = new sut.StatuspageSource(logger);
    const streams = source.streams(sourceConfig);
    const specificStream = streams[1];
    const cutoff = '2021-11-10T15:55:51.144Z';
    const iter = specificStream.readRecords(
      SyncMode.INCREMENTAL,
      undefined,
      undefined,
      {cutoff}
    );
    const list = [];
    for await (const item of iter) {
      list.push(item);
    }

    expect(mockFunc).toHaveBeenCalledTimes(1);
    expect(list).toHaveLength(3);
    expect(list).toStrictEqual(
      readTestResourceFile('incidentUpdates.json').filter(
        (u) => new Date(u.updated_at) > new Date(cutoff)
      )
    );
  });

  test('streams - incidentUpdates, use full_refresh sync mode', async () => {
    const mockFunc = jest.fn();

    Statuspage.instance = jest.fn().mockImplementation(() => {
      return new Statuspage(
        {
          get: jest.fn().mockResolvedValue({
            incidents: readTestResourceFile('incidents.json'),
          }),
        } as any,
        new Date('2010-03-27T14:03:51-0800'),
        logger
      );
    });
    const source = new sut.StatuspageSource(logger);
    const streams = source.streams(sourceConfig);
    const specificStream = streams[1];
    const iter = specificStream.readRecords(SyncMode.FULL_REFRESH);
    const list = [];
    for await (const item of iter) {
      list.push(item);
    }

    expect(mockFunc).toHaveBeenCalledTimes(1);
    expect(list).toStrictEqual(readTestResourceFile('incidentUpdates.json'));
  });

  test('streams - users, use full_refresh sync mode', async () => {
    const fnUsersFunc = jest.fn();

    Statuspage.instance = jest.fn().mockImplementation(() => {
      return new Statuspage(
        {
          get: fnUsersFunc.mockImplementation(async (path: string) => {
            const isPathMatch = path.match(/^\/organizations\/orgid\/users/);
            if (isPathMatch) {
              return {
                data: readTestResourceFile('users.json'),
              };
            }
          }),
        } as any,
        new Date('1970-01-01T00:00:00-0000'),
        logger
      );
    });
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
