import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import {
  readResourceAsJSON,
  readTestFileAsJSON,
} from 'faros-airbyte-testing-tools';
import {VError} from 'verror';

import * as sut from '../src/index';
import {
  ServiceNow,
  ServiceNowClient,
  ServiceNowConfig,
} from '../src/servicenow/servicenow';

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const incidents = readTestFileAsJSON('incidents.json');
  const incidentsRest = readTestFileAsJSON('incidentsRest.json');
  const users = readTestFileAsJSON('users.json');
  const listIncidents = jest.fn();
  const listUsers = jest.fn();
  const getCmdbCi = jest.fn();
  const getCmdbCiService = jest.fn();
  const checkConnection = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    listIncidents.mockResolvedValue([incidentsRest, 2]);
    listUsers.mockResolvedValue([users, 5]);
    getCmdbCi.mockResolvedValue('Storage Area Network 001');
    getCmdbCiService.mockResolvedValue('Email');
    checkConnection.mockResolvedValue({});
    ServiceNow.instance = jest.fn().mockReturnValue(
      new ServiceNow(
        {
          incidents: {
            list: listIncidents,
          },
          users: {
            list: listUsers,
          },
          cmdb_ci: {
            getIdentifier: getCmdbCi,
          },
          cmdb_ci_service: {
            getIdentifier: getCmdbCiService,
          },
          checkConnection,
        } as ServiceNowClient,
        {} as ServiceNowConfig,
        logger
      )
    );
  });

  test('spec', async () => {
    const source = new sut.ServiceNowSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceAsJSON('spec.json'))
    );
  });

  test('check connection bad token', async () => {
    const source = new sut.ServiceNowSource(logger);
    const expectedError = new VError('Bad Connection');
    checkConnection.mockRejectedValueOnce(expectedError);
    await expect(
      source.checkConnection({username: 'bad', password: 'bad', url: 'bad'})
    ).resolves.toStrictEqual([false, expectedError]);
  });

  const sourceConfig = {username: 'good', password: 'good', url: 'good'};

  test('check connection good token', async () => {
    const source = new sut.ServiceNowSource(logger);
    await expect(source.checkConnection(sourceConfig)).resolves.toStrictEqual([
      true,
      undefined,
    ]);
  });

  test('streams - incidents, use incremental sync mode', async () => {
    const source = new sut.ServiceNowSource(logger);
    const streams = source.streams(sourceConfig);
    const stream = streams[0];
    const sys_updated_on = '2022-02-27T21:00:44.706Z';
    const itemIter = stream.readRecords(
      SyncMode.INCREMENTAL,
      undefined,
      undefined,
      {sys_updated_on}
    );
    const items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    expect(items).toStrictEqual(incidents);
    expect(listIncidents.mock.calls.length).toBe(1);
    expect(listIncidents.mock.calls[0][1]).toBe(
      `sys_updated_on>${sys_updated_on}`
    );
    expect(getCmdbCi.mock.calls.length).toBe(1);
    expect(getCmdbCiService.mock.calls.length).toBe(1);
  });

  test('streams - incidents, use full_refresh sync mode', async () => {
    const source = new sut.ServiceNowSource(logger);
    const streams = source.streams(sourceConfig);
    const stream = streams[0];
    const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
    const items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    expect(items).toStrictEqual(incidents);
  });

  test('streams - incidents, handles an API error', async () => {
    listIncidents.mockReturnValueOnce([incidentsRest, 3]);
    listIncidents.mockRejectedValueOnce(new VError('API Error'));
    const source = new sut.ServiceNowSource(logger);
    const streams = source.streams(sourceConfig);
    const stream = streams[0];
    try {
      const iter = stream.readRecords(SyncMode.FULL_REFRESH);
      await iter.next();
    } catch (err: any) {
      fail('Error should have been handled.');
    }
  });

  test('streams - incidents, should cache cmdb_ci lookup failures', async () => {
    getCmdbCi.mockRejectedValueOnce(new VError('API Error'));
    const source = new sut.ServiceNowSource(logger);
    const streams = source.streams(sourceConfig);
    const stream = streams[0];
    const iter = stream.readRecords(SyncMode.FULL_REFRESH);
    await iter.next();
    await iter.next();
    expect(getCmdbCi.mock.calls.length).toBe(1);
  });

  test('streams - incidents, should cache cmdb_ci_service lookup failures', async () => {
    getCmdbCiService.mockRejectedValueOnce(new VError('API Error'));
    const source = new sut.ServiceNowSource(logger);
    const streams = source.streams(sourceConfig);
    const stream = streams[0];
    const iter = stream.readRecords(SyncMode.FULL_REFRESH);
    await iter.next();
    await iter.next();
    expect(getCmdbCiService.mock.calls.length).toBe(1);
  });

  test('streams - users, use incremental sync mode', async () => {
    const source = new sut.ServiceNowSource(logger);
    const streams = source.streams(sourceConfig);
    const stream = streams[1];
    const sys_updated_on = '2022-02-27T21:00:44.706Z';
    const itemIter = stream.readRecords(
      SyncMode.INCREMENTAL,
      undefined,
      undefined,
      {sys_updated_on}
    );
    const items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    expect(listUsers.mock.calls.length).toBe(1);
    expect(listUsers.mock.calls[0][1]).toBe(
      `ORDERBYsys_updated_on^sys_updated_on>${sys_updated_on}`
    );
  });

  test('streams - users, use full_refresh sync mode', async () => {
    const source = new sut.ServiceNowSource(logger);
    const streams = source.streams(sourceConfig);
    const stream = streams[1];
    const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
    const items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    expect(items).toStrictEqual(users);
  });

  test('streams - users, handles an API error', async () => {
    listUsers.mockReturnValueOnce([users, 5]);
    listUsers.mockRejectedValueOnce(new VError('API Error'));
    const source = new sut.ServiceNowSource(logger);
    const streams = source.streams(sourceConfig);
    const stream = streams[1];
    const items = [];
    try {
      const iter = stream.readRecords(SyncMode.FULL_REFRESH);
      for await (const item of iter) {
        items.push(item);
      }
    } catch (err: any) {
      fail('Error should have been handled.');
    }
    expect(items.length).toBe(5);
  });
});
