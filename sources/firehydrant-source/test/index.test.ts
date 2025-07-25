import {AxiosInstance} from 'axios';
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

import {FireHydrant} from '../src/firehydrant/firehydrant';
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
    const source = new sut.FireHydrantSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceAsJSON('spec.json'))
    );
  });

  const sourceConfig = {token: '', cutoff_days: 90};

  test('check connection', async () => {
    FireHydrant.instance = jest.fn().mockImplementation(() => {
      return new FireHydrant(
        {
          get: jest.fn().mockResolvedValue({}),
        } as unknown as AxiosInstance,
        new Date('2010-03-27T14:03:51-0800')
      );
    });

    const source = new sut.FireHydrantSource(logger);
    await expect(source.checkConnection(sourceConfig)).resolves.toStrictEqual([
      true,
      undefined,
    ]);
  });

  test('check connection - incorrect config', async () => {
    FireHydrant.instance = jest.fn().mockImplementation(() => {
      return new FireHydrant(null, null);
    });
    const source = new sut.FireHydrantSource(logger);
    const res = await source.checkConnection(sourceConfig);

    expect(res[0]).toBe(false);
    expect(res[1]).toBeDefined();
    expect(res[1].message).toMatch(
      /Please verify your token is correct. Error: Cannot read/
    );
  });

  test('streams - incidents, use full_refresh sync mode', async () => {
    const fnIncidentsList = jest.fn();
    FireHydrant.instance = jest.fn().mockImplementation(() => {
      return new FireHydrant(
        {
          get: fnIncidentsList.mockResolvedValue({
            data: {
              data: readTestFileAsJSON('incidents.json'),
              pagination: {
                next: null,
              },
            },
          }),
        } as any,
        new Date('2010-03-27T14:03:51-0800')
      );
    });
    const source = new sut.FireHydrantSource(logger);
    const streams = source.streams(sourceConfig);

    const incidentsStream = streams[0];
    const incidentsIter = incidentsStream.readRecords(SyncMode.FULL_REFRESH);
    const incidents = [];
    for await (const incident of incidentsIter) {
      incidents.push(incident);
    }
    expect(fnIncidentsList).toHaveBeenCalledTimes(1);
    expect(incidents).toStrictEqual(readTestFileAsJSON('incidents.json'));
  });

  test('streams - teams, use full_refresh sync mode', async () => {
    const fnTeamsList = jest.fn();
    FireHydrant.instance = jest.fn().mockImplementation(() => {
      return new FireHydrant(
        {
          get: fnTeamsList.mockResolvedValue({
            data: {
              data: readTestFileAsJSON('teams.json'),
              pagination: {
                next: null,
              },
            },
          }),
        } as any,
        new Date('2010-03-27T14:03:51-0800')
      );
    });
    const source = new sut.FireHydrantSource(logger);
    const streams = source.streams(sourceConfig);

    const teamsStream = streams[1];
    const teamsIter = teamsStream.readRecords(SyncMode.FULL_REFRESH);
    const teams = [];
    for await (const team of teamsIter) {
      teams.push(team);
    }
    expect(fnTeamsList).toHaveBeenCalledTimes(1);
    expect(teams).toStrictEqual(readTestFileAsJSON('teams.json'));
  });

  test('streams - users, use full_refresh sync mode', async () => {
    const fnUsersList = jest.fn();
    FireHydrant.instance = jest.fn().mockImplementation(() => {
      return new FireHydrant(
        {
          get: fnUsersList.mockResolvedValue({
            data: {
              data: readTestFileAsJSON('users.json'),
              pagination: {
                next: null,
              },
            },
          }),
        } as any,
        new Date('2010-03-27T14:03:51-0800')
      );
    });
    const source = new sut.FireHydrantSource(logger);
    const streams = source.streams(sourceConfig);

    const usersStream = streams[2];
    const usersIter = usersStream.readRecords(SyncMode.FULL_REFRESH);
    const users = [];
    for await (const user of usersIter) {
      users.push(user);
    }
    expect(fnUsersList).toHaveBeenCalledTimes(1);
    expect(users).toStrictEqual(readTestFileAsJSON('users.json'));
  });
});
