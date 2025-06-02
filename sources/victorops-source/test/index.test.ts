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
import {Incident} from '../src/victorops';
import {Victorops} from '../src/victorops';

jest.mock('axios-retry');

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
    const source = new sut.VictoropsSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceAsJSON('spec.json'))
    );
  });

  test('check connection - if config params are not provided', async () => {
    const source = new sut.VictoropsSource(logger);
    await expect(source.checkConnection({} as any)).resolves.toStrictEqual([
      false,
      new VError('API ID must be not an empty string'),
    ]);
    await expect(
      source.checkConnection({apiId: '111', cutoff_days: 90, apiKey: ''})
    ).resolves.toStrictEqual([
      false,
      new VError('API key must be not an empty string'),
    ]);
  });

  test('check connection', async () => {
    Victorops.instance = jest.fn().mockImplementation(() => {
      return new Victorops(
        {
          users: {getUsers: jest.fn().mockResolvedValue({})},
        } as any,
        new Date('2010-03-27T14:03:51-0800')
      );
    });
    const source = new sut.VictoropsSource(logger);
    await expect(
      source.checkConnection({
        apiId: 'apiId',
        apiKey: 'apiKey',
        cutoff_days: 90,
      })
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('check connection - incorrect config parameters', async () => {
    Victorops.instance = jest.fn().mockImplementation(() => {
      return new Victorops(
        {
          users: {getUsers: jest.fn().mockRejectedValue({})},
        } as any,
        new Date('2010-03-27T14:03:51-0800')
      );
    });
    const source = new sut.VictoropsSource(logger);
    await expect(
      source.checkConnection({
        apiId: 'apiId',
        apiKey: 'apiKey',
        cutoff_days: 90,
      })
    ).resolves.toStrictEqual([
      false,
      new VError('Please verify your API ID or key are correct. Error: '),
    ]);
  });

  test('streams - incidents, use full_refresh sync mode', async () => {
    const fnIncidentsList = jest.fn();

    Victorops.instance = jest.fn().mockImplementation(() => {
      return new Victorops(
        {
          reporting: {
            getIncidentHistory: fnIncidentsList.mockResolvedValue({
              incidents: readTestFileAsJSON('incidents.json'),
            }),
          },
        } as any,
        new Date('2010-03-27T14:03:51-0800')
      );
    });

    const source = new sut.VictoropsSource(logger);
    const [incidentsStream] = source.streams({
      apiId: 'apiId',
      apiKey: 'apiKey',
      cutoff_days: 90,
    });
    const incidentsIter = incidentsStream.readRecords(SyncMode.FULL_REFRESH);
    const incidents = [];
    for await (const incident of incidentsIter) {
      incidents.push(incident);
    }
    expect(fnIncidentsList).toHaveBeenCalledTimes(1);
    expect(incidents).toStrictEqual(readTestFileAsJSON('incidents.json'));
  });

  test('streams - incidents, use incremental sync mode', async () => {
    const fnIncidentsList = jest.fn();

    Victorops.instance = jest.fn().mockImplementation(() => {
      return new Victorops(
        {
          reporting: {
            getIncidentHistory: fnIncidentsList.mockImplementation(
              ({startedAfter}: {startedAfter: Date}) => {
                const incidentsFile: Incident[] =
                  readTestFileAsJSON('incidents.json');

                return {
                  incidents: incidentsFile.filter(
                    (i) => new Date(i.startTime) > startedAfter
                  ),
                };
              }
            ),
          },
        } as any,
        new Date('2010-03-27T14:03:51-0800')
      );
    });

    const source = new sut.VictoropsSource(logger);
    const [incidentsStream] = source.streams({
      apiId: 'apiId',
      apiKey: 'apiKey',
      cutoff_days: 90,
    });
    const incidentsIter = incidentsStream.readRecords(
      SyncMode.INCREMENTAL,
      undefined,
      undefined,
      {cutoff: '2025-01-01T08:00:00.000Z'}
    );
    const incidents = [];
    for await (const incident of incidentsIter) {
      incidents.push(incident);
    }
    expect(fnIncidentsList).toHaveBeenCalledTimes(1);
    expect(incidents).toStrictEqual([]);
  });

  test('streams - teams, use full_refresh sync mode', async () => {
    const fnTeamsList = jest.fn();

    Victorops.instance = jest.fn().mockImplementation(() => {
      return new Victorops(
        {
          teams: {
            getTeams: fnTeamsList.mockResolvedValue(
              readTestFileAsJSON('teams.json')
            ),
          },
        } as any,
        new Date('2010-03-27T14:03:51-0800')
      );
    });

    const source = new sut.VictoropsSource(logger);
    const [, teamsStream] = source.streams({
      apiId: 'apiId',
      apiKey: 'apiKey',
      cutoff_days: 90,
    });
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

    Victorops.instance = jest.fn().mockImplementation(() => {
      return new Victorops(
        {
          users: {
            getUsers: fnUsersList.mockResolvedValue({
              users: {flat: () => readTestFileAsJSON('users.json')},
            }),
          },
        } as any,
        new Date('2010-03-27T14:03:51-0800')
      );
    });

    const source = new sut.VictoropsSource(logger);
    const [, , usersStream] = source.streams({
      apiId: 'apiId',
      apiKey: 'apiKey',
      cutoff_days: 90,
    });
    const usersIter = usersStream.readRecords(SyncMode.FULL_REFRESH);
    const users = [];
    for await (const user of usersIter) {
      users.push(user);
    }
    expect(fnUsersList).toHaveBeenCalledTimes(1);
    expect(users).toStrictEqual(readTestFileAsJSON('users.json'));
  });
});
