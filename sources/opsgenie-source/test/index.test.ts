import {AxiosInstance} from 'axios';
import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';

import * as sut from '../src/index';
import {OpsGenie} from '../src/opsgenie/opsgenie';

function readResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
}

function readTestResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
}

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
    const source = new sut.OpsGenieSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  const sourceConfig = {api_key: 'key', cutoff_days: 90};

  test('check connection', async () => {
    OpsGenie.instance = jest.fn().mockImplementation(() => {
      return new OpsGenie(
        {
          get: jest.fn().mockResolvedValue({}),
        } as unknown as AxiosInstance,
        new Date('2010-03-27T14:03:51-0800'),
        1,
        logger
      );
    });

    const source = new sut.OpsGenieSource(logger);
    await expect(source.checkConnection(sourceConfig)).resolves.toStrictEqual([
      true,
      undefined,
    ]);
  });

  test('check connection - incorrect config', async () => {
    OpsGenie.instance = jest.fn().mockImplementation(() => {
      return new OpsGenie(null, null, 1, logger);
    });
    const source = new sut.OpsGenieSource(logger);
    const res = await source.checkConnection(sourceConfig);
    expect(res[0]).toBe(false);
    expect(res[1]).toBeDefined();
    expect(res[1].message).toMatch(
      /Please verify your api key is correct. Error: Cannot read/
    );
  });

  test('streams - incidents, use full_refresh sync mode', async () => {
    const fnIncidentsList = jest.fn();
    OpsGenie.instance = jest.fn().mockImplementation(() => {
      return new OpsGenie(
        {
          get: fnIncidentsList.mockResolvedValue({
            data: {
              data: readTestResourceFile('incidents.json'),
              totalCount: 3,
            },
          }),
        } as any,
        new Date('2010-03-27T14:03:51-0800'),
        10,
        logger
      );
    });
    const source = new sut.OpsGenieSource(logger);
    const streams = source.streams(sourceConfig);

    const incidentsStream = streams[0];
    const incidentsIter = incidentsStream.readRecords(SyncMode.FULL_REFRESH);
    const incidents = [];
    for await (const incident of incidentsIter) {
      incidents.push(incident);
    }
    expect(fnIncidentsList).toHaveBeenCalledTimes(4);
    expect(incidents).toStrictEqual(readTestResourceFile('incidents.json'));
  });

  test('streams - incidents, paginate', async () => {
    const fnIncidentsList = jest.fn();
    OpsGenie.instance = jest.fn().mockImplementation(() => {
      return new OpsGenie(
        {
          get: fnIncidentsList.mockResolvedValue({
            data: {
              data: readTestResourceFile('incidents.json'),
              totalCount: 2,
            },
          }),
        } as any,
        new Date('2010-03-27T14:03:51-0800'),
        1,
        logger
      );
    });
    const source = new sut.OpsGenieSource(logger);
    const streams = source.streams(sourceConfig);

    const incidentsStream = streams[0];
    const incidentsIter = incidentsStream.readRecords(SyncMode.FULL_REFRESH);
    const incidents = [];
    for await (const incident of incidentsIter) {
      incidents.push(incident);
    }
    expect(fnIncidentsList).toHaveBeenCalledTimes(8);
  });

  test('streams - teams, use full_refresh sync mode', async () => {
    const fnTeamsList = jest.fn();
    OpsGenie.instance = jest.fn().mockImplementation(() => {
      return new OpsGenie(
        {
          get: fnTeamsList.mockResolvedValue({
            data: {
              data: readTestResourceFile('teams.json'),
            },
          }),
        } as any,
        new Date('2010-03-27T14:03:51-0800'),
        10,
        logger
      );
    });
    const source = new sut.OpsGenieSource(logger);
    const streams = source.streams(sourceConfig);

    const teamsStream = streams[2];
    const teamsIter = teamsStream.readRecords(SyncMode.FULL_REFRESH);
    const teams = [];
    for await (const team of teamsIter) {
      teams.push(team);
    }
    expect(fnTeamsList).toHaveBeenCalledTimes(1);
    expect(teams).toStrictEqual(readTestResourceFile('teams.json'));
  });

  test('streams - users, use full_refresh sync mode', async () => {
    const fnUsersList = jest.fn();
    OpsGenie.instance = jest.fn().mockImplementation(() => {
      return new OpsGenie(
        {
          get: fnUsersList.mockResolvedValue({
            data: {
              data: readTestResourceFile('users.json'),
              totalCount: 1,
            },
          }),
        } as any,
        new Date('2010-03-27T14:03:51-0800'),
        10,
        logger
      );
    });
    const source = new sut.OpsGenieSource(logger);
    const streams = source.streams(sourceConfig);

    const usersStream = streams[3];
    const usersIter = usersStream.readRecords(SyncMode.FULL_REFRESH);
    const users = [];
    for await (const user of usersIter) {
      users.push(user);
    }
    expect(fnUsersList).toHaveBeenCalledTimes(1);
    expect(users).toStrictEqual(readTestResourceFile('users.json'));
  });

  test('streams - users, paginate', async () => {
    const fnUsersList = jest.fn();
    OpsGenie.instance = jest.fn().mockImplementation(() => {
      return new OpsGenie(
        {
          get: fnUsersList.mockResolvedValue({
            data: {
              data: readTestResourceFile('users.json'),
              totalCount: 2,
            },
          }),
        } as any,
        new Date('2010-03-27T14:03:51-0800'),
        1,
        logger
      );
    });
    const source = new sut.OpsGenieSource(logger);
    const streams = source.streams(sourceConfig);

    const usersStream = streams[3];
    const usersIter = usersStream.readRecords(SyncMode.FULL_REFRESH);
    const users = [];
    for await (const user of usersIter) {
      users.push(user);
    }
    expect(fnUsersList).toHaveBeenCalledTimes(2);
  });

  test('streams - alerts, use full_refresh sync mode', async () => {
    const fnAlertsList = jest.fn();
    OpsGenie.instance = jest.fn().mockImplementation(() => {
      return new OpsGenie(
        {
          get: fnAlertsList.mockResolvedValue({
            data: {
              data: readTestResourceFile('alerts.json'),
              totalCount: 2,
            },
          }),
        } as any,
        new Date('2010-03-27T14:03:51-0800'),
        10,
        logger
      );
    });
    const source = new sut.OpsGenieSource(logger);
    const streams = source.streams(sourceConfig);

    const alertsStream = streams[1];
    const alertssIter = alertsStream.readRecords(SyncMode.FULL_REFRESH);
    const alerts = [];
    for await (const alert of alertssIter) {
      alerts.push(alert);
    }
    expect(fnAlertsList).toHaveBeenCalledTimes(1);
    expect(alerts).toStrictEqual(readTestResourceFile('alerts.json'));
  });

  test('streams - alerts, paginate', async () => {
    const fnAlertsList = jest.fn();
    OpsGenie.instance = jest.fn().mockImplementation(() => {
      return new OpsGenie(
        {
          get: fnAlertsList.mockResolvedValue({
            data: {
              data: readTestResourceFile('alerts.json'),
              totalCount: 2,
            },
          }),
        } as any,
        new Date('2010-03-27T14:03:51-0800'),
        1,
        logger
      );
    });
    const source = new sut.OpsGenieSource(logger);
    const streams = source.streams(sourceConfig);

    const alertsStream = streams[1];
    const alertssIter = alertsStream.readRecords(SyncMode.FULL_REFRESH);
    const alerts = [];
    for await (const alert of alertssIter) {
      alerts.push(alert);
    }
    expect(fnAlertsList).toHaveBeenCalledTimes(2);
  });
});
