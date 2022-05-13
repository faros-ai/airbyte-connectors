import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import * as sut from '../src/index';
import {
  ServiceNow,
  ServiceNowClient,
  ServiceNowConfig,
} from '../src/servicenow/servicenow';

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

  const incidents = readTestResourceFile('incidents.json');
  const users = readTestResourceFile('users.json');
  const listIncidents = jest.fn().mockResolvedValue(incidents);
  const listUsers = jest.fn().mockResolvedValue(users);
  const checkConnection = jest.fn().mockResolvedValue({});
  ServiceNow.instance = jest.fn().mockReturnValue(
    new ServiceNow(
      {
        incidents: {
          list: listIncidents,
        },
        users: {
          list: listUsers,
        },
        checkConnection,
      } as ServiceNowClient,
      {} as ServiceNowConfig,
      logger
    )
  );

  test('spec', async () => {
    const source = new sut.ServiceNowSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection bad token', async () => {
    const source = new sut.ServiceNowSource(logger);
    const expectedError = new VError('Bad Connection');
    checkConnection.mockRejectedValueOnce(expectedError);
    await expect(
      source.checkConnection({username: 'bad', password: 'bad'})
    ).resolves.toStrictEqual([false, expectedError]);
  });

  test('check connection good token', async () => {
    const source = new sut.ServiceNowSource(logger);
    await expect(
      source.checkConnection({username: 'good', password: 'good'})
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('streams - incidents, use incremental sync mode', async () => {
    const source = new sut.ServiceNowSource(logger);
    const streams = source.streams({});
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
    expect(listIncidents.mock.calls.length).toBe(1);
    expect(listIncidents.mock.calls[0][1]).toBe(
      `sys_updated_on>=${sys_updated_on}`
    );
  });

  test('streams - incidents, use full_refresh sync mode', async () => {
    const source = new sut.ServiceNowSource(logger);
    const streams = source.streams({});
    const stream = streams[0];
    const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
    const items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    expect(items).toStrictEqual(incidents);
  });

  test('streams - users, use incremental sync mode', async () => {
    const source = new sut.ServiceNowSource(logger);
    const streams = source.streams({
      apiKey: '',
      applicationKey: '',
    });
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
      `sys_updated_on>=${sys_updated_on}`
    );
  });

  test('streams - users, use full_refresh sync mode', async () => {
    const source = new sut.ServiceNowSource(logger);
    const streams = source.streams({});
    const stream = streams[1];
    const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
    const items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    expect(items).toStrictEqual(users);
  });
});
