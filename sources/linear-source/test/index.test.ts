import {AxiosInstance} from 'axios';
import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import * as sut from '../src/index';
import {Linear} from '../src/linear/linear';

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
    const source = new sut.LinearSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });
  test('check connection', async () => {
    Linear.instance = jest.fn().mockImplementation(() => {
      return new Linear(null);
    });

    const source = new sut.LinearSource(logger);
    await expect(
      source.checkConnection({
        api_key: 'api_key',
      })
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('check connection - incorrect config', async () => {
    Linear.instance = jest.fn().mockImplementation(() => {
      return new Linear(null);
    });
    const source = new sut.LinearSource(logger);
    const res = await source.checkConnection({
      api_key: '',
    });

    expect(res[0]).toBe(false);
    expect(res[1]).toBeDefined();
    expect(res[1].message).toMatch(
      "Please verify your API key is correct. Error: Cannot read properties of null (reading 'request')"
    );
  });

  test('streams - cycles, use full_refresh sync mode', async () => {
    const fnCyclesList = jest.fn();
    Linear.instance = jest.fn().mockImplementation(() => {
      return new Linear({
        request: fnCyclesList.mockResolvedValue({
          cycles: {
            nodes: readTestResourceFile('cycles.json'),
          },
        }),
      } as any);
    });
    const source = new sut.LinearSource(logger);
    const streams = source.streams({});

    const cyclesStream = streams[0];
    const cyclesIter = cyclesStream.readRecords(SyncMode.FULL_REFRESH);
    const cycles = [];
    for await (const cycle of cyclesIter) {
      cycles.push(cycle);
    }
    expect(fnCyclesList).toHaveBeenCalledTimes(1);
    expect(cycles).toStrictEqual(readTestResourceFile('cycles.json'));
  });

  test('streams - issuelabels, use full_refresh sync mode', async () => {
    const fnIssueLabelsList = jest.fn();
    Linear.instance = jest.fn().mockImplementation(() => {
      return new Linear({
        request: fnIssueLabelsList.mockResolvedValue({
          issueLabels: {
            nodes: readTestResourceFile('issuelabels.json'),
          },
        }),
      } as any);
    });
    const source = new sut.LinearSource(logger);
    const streams = source.streams({});

    const issuelabelsStream = streams[1];
    const issuelabelsIter = issuelabelsStream.readRecords(
      SyncMode.FULL_REFRESH
    );
    const issuelabels = [];
    for await (const issuelabel of issuelabelsIter) {
      issuelabels.push(issuelabel);
    }
    expect(fnIssueLabelsList).toHaveBeenCalledTimes(1);
    expect(issuelabels).toStrictEqual(readTestResourceFile('issuelabels.json'));
  });

  test('streams - projects, use full_refresh sync mode', async () => {
    const fnProjectsList = jest.fn();
    Linear.instance = jest.fn().mockImplementation(() => {
      return new Linear({
        request: fnProjectsList.mockResolvedValue({
          projects: {
            nodes: readTestResourceFile('projects.json'),
          },
        }),
      } as any);
    });
    const source = new sut.LinearSource(logger);
    const streams = source.streams({});

    const projectsStream = streams[3];
    const projectsIter = projectsStream.readRecords(SyncMode.FULL_REFRESH);
    const projects = [];
    for await (const project of projectsIter) {
      projects.push(project);
    }
    expect(fnProjectsList).toHaveBeenCalledTimes(1);
    expect(projects).toStrictEqual(readTestResourceFile('projects.json'));
  });

  test('streams - teams, use full_refresh sync mode', async () => {
    const fnTeamsList = jest.fn();
    Linear.instance = jest.fn().mockImplementation(() => {
      return new Linear({
        request: fnTeamsList.mockResolvedValue({
          teams: {
            nodes: readTestResourceFile('teams_input.json'),
          },
        }),
      } as any);
    });
    const source = new sut.LinearSource(logger);
    const streams = source.streams({});

    const teamsStream = streams[4];
    const teamsIter = teamsStream.readRecords(SyncMode.FULL_REFRESH);
    const teams = [];
    for await (const team of teamsIter) {
      teams.push(team);
    }
    expect(fnTeamsList).toHaveBeenCalledTimes(1);
    expect(teams).toStrictEqual(readTestResourceFile('teams.json'));
  });

  test('streams - users, use full_refresh sync mode', async () => {
    const fnTeamsList = jest.fn();
    Linear.instance = jest.fn().mockImplementation(() => {
      return new Linear({
        request: fnTeamsList.mockResolvedValue({
          users: {
            nodes: readTestResourceFile('users.json'),
          },
        }),
      } as any);
    });
    const source = new sut.LinearSource(logger);
    const streams = source.streams({});

    const usersStream = streams[5];
    const usersIter = usersStream.readRecords(SyncMode.FULL_REFRESH);
    const users = [];
    for await (const user of usersIter) {
      users.push(user);
    }
    expect(fnTeamsList).toHaveBeenCalledTimes(1);
    expect(users).toStrictEqual(readTestResourceFile('users.json'));
  });
});
