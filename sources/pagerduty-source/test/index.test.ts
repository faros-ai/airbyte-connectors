import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import moment from 'moment';
import {VError} from 'verror';

import * as sut from '../src/index';
import {Pagerduty} from '../src/pagerduty';

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
    const source = new sut.PagerdutySource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection', async () => {
    Pagerduty.instance = jest.fn().mockImplementation(() => {
      return new Pagerduty({get: jest.fn().mockResolvedValue({})}, logger);
    });

    const source = new sut.PagerdutySource(logger);
    await expect(
      source.checkConnection({
        token: 'token',
      })
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('check connection - incorrect config', async () => {
    Pagerduty.instance = jest.fn().mockImplementation(() => {
      return new Pagerduty(
        {get: jest.fn().mockRejectedValue('some text')},
        logger
      );
    });
    const source = new sut.PagerdutySource(logger);
    await expect(
      source.checkConnection({
        token: 'token',
      })
    ).resolves.toStrictEqual([
      false,
      new VError(
        'Please verify your token are correct. Error: err must be an Error'
      ),
    ]);
  });

  test('streams - incidentLogEntries, use full_refresh sync mode', async () => {
    const fnIncidentLogEntriesList = jest.fn();

    Pagerduty.instance = jest.fn().mockImplementation(() => {
      return new Pagerduty(
        {
          get: fnIncidentLogEntriesList.mockImplementation(
            async (path: string) => {
              const isPathMatch = path.match(/^\/log_entries/);
              if (isPathMatch) {
                return {
                  resource: readTestResourceFile('incidentLogEntries.json'),
                };
              }
            }
          ),
        },
        logger
      );
    });
    const source = new sut.PagerdutySource(logger);
    const streams = source.streams({
      token: 'pass',
    });

    const incidentLogEntriesStream = streams[0];
    const incidentLogEntriesIter = incidentLogEntriesStream.readRecords(
      SyncMode.FULL_REFRESH
    );
    const incidentLogEntries = [];
    for await (const logEntry of incidentLogEntriesIter) {
      incidentLogEntries.push(logEntry);
    }
    expect(fnIncidentLogEntriesList).toHaveBeenCalledTimes(1);
    expect(incidentLogEntries).toStrictEqual(
      readTestResourceFile('incidentLogEntries.json')
    );
  });

  test('streams - incidents, use full_refresh sync mode', async () => {
    const fnIncidentsList = jest.fn();

    Pagerduty.instance = jest.fn().mockImplementation(() => {
      return new Pagerduty(
        {
          get: fnIncidentsList.mockImplementation(async (path: string) => {
            const isPathMatch = path.match(/^\/incidents/);
            if (isPathMatch) {
              return {
                resource: readTestResourceFile('incidents.json'),
              };
            }
          }),
        },
        logger
      );
    });
    const source = new sut.PagerdutySource(logger);
    const streams = source.streams({
      token: 'pass',
    });

    const incidentsStream = streams[1];
    const incidentsIter = incidentsStream.readRecords(SyncMode.FULL_REFRESH);
    const incidents = [];
    for await (const incident of incidentsIter) {
      incidents.push(incident);
    }

    expect(fnIncidentsList).toHaveBeenCalledTimes(1);
    expect(incidents).toStrictEqual(readTestResourceFile('incidents.json'));
  });

  test('streams - prioritiesResource, use full_refresh sync mode', async () => {
    const fnPrioritiesResourceList = jest.fn();

    Pagerduty.instance = jest.fn().mockImplementation(() => {
      return new Pagerduty(
        {
          get: fnPrioritiesResourceList.mockImplementation(
            async (path: string) => {
              const isPathMatch = path.match(/^\/priorities/);
              if (isPathMatch) {
                return {
                  resource: readTestResourceFile('prioritiesResource.json'),
                  response: {
                    ok: true,
                  },
                };
              }
            }
          ),
        },
        logger
      );
    });
    const source = new sut.PagerdutySource(logger);
    const streams = source.streams({
      token: 'pass',
    });

    const prioritiesResourceStream = streams[2];
    const prioritiesResourceIter = prioritiesResourceStream.readRecords(
      SyncMode.FULL_REFRESH
    );
    const priorities = [];
    for await (const priority of prioritiesResourceIter) {
      priorities.push(priority);
    }

    expect(fnPrioritiesResourceList).toHaveBeenCalledTimes(1);
    expect(priorities).toStrictEqual(
      readTestResourceFile('prioritiesResource.json')
    );
  });

  test('streams - users, use full_refresh sync mode', async () => {
    const fnUsersList = jest.fn();

    Pagerduty.instance = jest.fn().mockImplementation(() => {
      return new Pagerduty(
        {
          get: fnUsersList.mockImplementation(async (path: string) => {
            const isPathMatch = path.match(/^\/users/);
            if (isPathMatch) {
              return {
                resource: readTestResourceFile('users.json'),
              };
            }
          }),
        },
        logger
      );
    });
    const source = new sut.PagerdutySource(logger);
    const streams = source.streams({
      token: 'pass',
    });

    const usersStream = streams[3];
    const usersIter = usersStream.readRecords(SyncMode.FULL_REFRESH);
    const users = [];
    for await (const user of usersIter) {
      users.push(user);
    }
    expect(fnUsersList).toHaveBeenCalledTimes(1);
    expect(users).toStrictEqual(readTestResourceFile('users.json'));
  });

  test('streams - teams, use full_refresh sync mode', async () => {
    const fnTeamsList = jest.fn();

    Pagerduty.instance = jest.fn().mockImplementation(() => {
      return new Pagerduty(
        {
          get: fnTeamsList.mockImplementation(async (path: string) => {
            const isPathMatch = path.match(/^\/teams/);
            if (isPathMatch) {
              return {
                resource: readTestResourceFile('teams.json'),
              };
            }
          }),
        },
        logger
      );
    });
    const source = new sut.PagerdutySource(logger);
    const streams = source.streams({
      token: 'pass',
    });

    const teamsStream = streams[3];
    const teamsIter = teamsStream.readRecords(SyncMode.FULL_REFRESH);
    const teams = [];
    for await (const team of teamsIter) {
      teams.push(team);
    }
    expect(fnTeamsList).toHaveBeenCalledTimes(1);
    expect(teams).toStrictEqual(readTestResourceFile('teams.json'));
  });
});
