import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import {readResourceFile} from 'faros-airbyte-common/common';
import fs from 'fs-extra';

import * as sut from '../src/index';
import {Shortcut, ShortcutConfig} from '../src/shortcut';

const shortcutInstance = Shortcut.instance;

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
    Shortcut.instance = shortcutInstance;
  });

  test('spec', async () => {
    const source = new sut.ShortcutSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection', async () => {
    const fnProjectsFunc = jest.fn();
    Shortcut.instance = jest.fn().mockImplementation(() => {
      return new Shortcut(
        {} as ShortcutConfig,
        {
          listProjects: fnProjectsFunc.mockResolvedValue({
            data: readTestResourceFile('projects.json'),
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
            readTestResourceFile('projects.json')
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
      readTestResourceFile('projects.json')
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
            readTestResourceFile('iterations.json')
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
      readTestResourceFile('iterations.json')
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
            readTestResourceFile('epics.json')
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
      readTestResourceFile('epics.json')
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
            readTestResourceFile('members.json')
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
      readTestResourceFile('members.json')
    );
  });
});
