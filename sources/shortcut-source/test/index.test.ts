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

import * as sut from '../src/index';
import {Shortcut, ShortcutConfig} from '../src/shortcut';

const shortcutInstance = Shortcut.instance;

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  beforeEach(() => {
    Shortcut.instance = shortcutInstance;
  });

  test('spec', async () => {
    const source = new sut.ShortcutSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceAsJSON('spec.json'))
    );
  });

  test('check connection', async () => {
    const fnProjectsFunc = jest.fn();
    Shortcut.instance = jest.fn().mockImplementation(() => {
      return new Shortcut(
        {} as ShortcutConfig,
        {
          listProjects: fnProjectsFunc.mockResolvedValue({
            data: readTestFileAsJSON('projects.json'),
          }),
          hasNextPage: jest.fn(),
        } as any
      );
    });

    const source = new sut.ShortcutSource(logger);
    await expect(
      source.checkConnection({
        token: 'token',
        base_url: 'base_url',
        version: 'version',
      })
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('streams - projects, use full_refresh sync mode', async () => {
    const fnProjectsFunc = jest.fn();

    Shortcut.instance = jest.fn().mockImplementation(() => {
      return new Shortcut(
        {
          token: 'token',
          base_url: 'base_url',
          version: 'version',
        } as ShortcutConfig,
        {
          listProjects: fnProjectsFunc.mockResolvedValue(
            readTestFileAsJSON('projects.json')
          ),
          hasNextPage: jest.fn(),
        } as any
      );
    });
    const source = new sut.ShortcutSource(logger);
    const streams = source.streams({
      token: 'token',
      base_url: 'base_url',
      version: 'version',
    } as ShortcutConfig);

    const projectsStream = streams[0];
    const projectsIter = projectsStream.readRecords(SyncMode.FULL_REFRESH);
    const projects = [];
    for await (const project of projectsIter) {
      projects.push(project);
    }
    expect(fnProjectsFunc).toHaveBeenCalledTimes(1);
    expect(JSON.parse(JSON.stringify(projects))).toStrictEqual(
      readTestFileAsJSON('projects.json')
    );
  });

  test('streams - iterations, use full_refresh sync mode', async () => {
    const fnIterationsFunc = jest.fn();

    Shortcut.instance = jest.fn().mockImplementation(() => {
      return new Shortcut(
        {
          token: 'token',
          base_url: 'base_url',
          version: 'version',
        } as ShortcutConfig,
        {
          listIterations: fnIterationsFunc.mockResolvedValue(
            readTestFileAsJSON('iterations.json')
          ),
          hasNextPage: jest.fn(),
        } as any
      );
    });
    const source = new sut.ShortcutSource(logger);
    const streams = source.streams({
      token: 'token',
      base_url: 'base_url',
      version: 'version',
    } as ShortcutConfig);

    const iterationsStream = streams[1];
    const iterationsIter = iterationsStream.readRecords(SyncMode.FULL_REFRESH);
    const iterations = [];
    for await (const iteration of iterationsIter) {
      iterations.push(iteration);
    }
    expect(fnIterationsFunc).toHaveBeenCalledTimes(1);
    expect(JSON.parse(JSON.stringify(iterations))).toStrictEqual(
      readTestFileAsJSON('iterations.json')
    );
  });

  test('streams - epics, use full_refresh sync mode', async () => {
    const fnEpicsFunc = jest.fn();

    Shortcut.instance = jest.fn().mockImplementation(() => {
      return new Shortcut(
        {
          token: 'token',
          base_url: 'base_url',
          version: 'version',
          project_public_id: 17,
        } as ShortcutConfig,
        {
          listEpics: fnEpicsFunc.mockResolvedValue(
            readTestFileAsJSON('epics.json')
          ),
          hasNextPage: jest.fn(),
        } as any
      );
    });
    const source = new sut.ShortcutSource(logger);
    const streams = source.streams({
      token: 'token',
      base_url: 'base_url',
      version: 'version',
      project_public_id: 17,
    } as ShortcutConfig);

    const epicsStream = streams[2];
    const epicsIter = epicsStream.readRecords(SyncMode.FULL_REFRESH);
    const epics = [];
    for await (const epic of epicsIter) {
      epics.push(epic);
    }
    expect(fnEpicsFunc).toHaveBeenCalledTimes(1);
    expect(JSON.parse(JSON.stringify(epics))).toStrictEqual(
      readTestFileAsJSON('epics.json')
    );
  });

  test('streams - members, use full_refresh sync mode', async () => {
    const fnMembersFunc = jest.fn();

    Shortcut.instance = jest.fn().mockImplementation(() => {
      return new Shortcut(
        {
          token: 'token',
          base_url: 'base_url',
          version: 'version',
        } as ShortcutConfig,
        {
          listMembers: fnMembersFunc.mockResolvedValue(
            readTestFileAsJSON('members.json')
          ),
          hasNextPage: jest.fn(),
        } as any
      );
    });
    const source = new sut.ShortcutSource(logger);
    const streams = source.streams({
      token: 'token',
      base_url: 'base_url',
      version: 'version',
    } as ShortcutConfig);

    const membersStream = streams[4];
    const membersIter = membersStream.readRecords(SyncMode.FULL_REFRESH);
    const members = [];
    for await (const member of membersIter) {
      members.push(member);
    }
    expect(fnMembersFunc).toHaveBeenCalledTimes(1);
    expect(JSON.parse(JSON.stringify(members))).toStrictEqual(
      readTestFileAsJSON('members.json')
    );
  });
});
