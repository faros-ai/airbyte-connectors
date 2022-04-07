import {AxiosInstance} from 'axios';
import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import {FireHydrant} from '../src/firehydrant/firehydrant';
import * as sut from '../src/index';

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
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('spec', async () => {
    const source = new sut.FireHydrantSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });
  test('check connection', async () => {
    FireHydrant.instance = jest.fn().mockImplementation(() => {
      return new FireHydrant({
        get: jest.fn().mockResolvedValue({}),
      } as unknown as AxiosInstance);
    });

    const source = new sut.FireHydrantSource(logger);
    await expect(
      source.checkConnection({
        token: '',
      })
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('check connection - incorrect config', async () => {
    FireHydrant.instance = jest.fn().mockImplementation(() => {
      return new FireHydrant(null, null);
    });
    const source = new sut.FireHydrantSource(logger);
    await expect(
      source.checkConnection({
        token: '',
      })
    ).resolves.toStrictEqual([
      false,
      new VError(
        "Please verify your token is correct. Error: Cannot read property 'get' of null"
      ),
    ]);
  });

  test('streams - incidents, use full_refresh sync mode', async () => {
    const fnIncidentsList = jest.fn();
    FireHydrant.instance = jest.fn().mockImplementation(() => {
      return new FireHydrant({
        get: fnIncidentsList.mockResolvedValue({
          data: {
            data: readTestResourceFile('incidents.json'),
            pagination: {
              next: null,
            },
          },
        }),
      } as any);
    });
    const source = new sut.FireHydrantSource(logger);
    const streams = source.streams({});

    const incidentsStream = streams[0];
    const incidentsIter = incidentsStream.readRecords(SyncMode.FULL_REFRESH);
    const incidents = [];
    for await (const incident of incidentsIter) {
      incidents.push(incident);
    }
    expect(fnIncidentsList).toHaveBeenCalledTimes(4);
    expect(incidents).toStrictEqual(readTestResourceFile('incidents.json'));
  });

  test('streams - teams, use full_refresh sync mode', async () => {
    const fnTeamsList = jest.fn();
    FireHydrant.instance = jest.fn().mockImplementation(() => {
      return new FireHydrant({
        get: fnTeamsList.mockResolvedValue({
          data: {
            data: readTestResourceFile('teams.json'),
            pagination: {
              next: null,
            },
          },
        }),
      } as any);
    });
    const source = new sut.FireHydrantSource(logger);
    const streams = source.streams({});

    const teamsStream = streams[1];
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
    FireHydrant.instance = jest.fn().mockImplementation(() => {
      return new FireHydrant({
        get: fnUsersList.mockResolvedValue({
          data: {
            data: readTestResourceFile('users.json'),
            pagination: {
              next: null,
            },
          },
        }),
      } as any);
    });
    const source = new sut.FireHydrantSource(logger);
    const streams = source.streams({});

    const usersStream = streams[2];
    const usersIter = usersStream.readRecords(SyncMode.FULL_REFRESH);
    const users = [];
    for await (const user of usersIter) {
      users.push(user);
    }
    expect(fnUsersList).toHaveBeenCalledTimes(1);
    expect(users).toStrictEqual(readTestResourceFile('users.json'));
  });
});
