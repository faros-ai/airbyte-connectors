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

import {Backlog, BacklogConfig} from '../src/backlog';
import * as sut from '../src/index';

const backlogInstance = Backlog.instance;

jest.mock('axios');

describe('index', () => {
  test('ok?', async () => {
    expect('OK').toEqual('OK');
  });
});

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  beforeEach(() => {
    Backlog.instance = backlogInstance;
  });

  test('spec', async () => {
    const source = new sut.BacklogSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceAsJSON('spec.json'))
    );
  });

  test('check connection - no apiKey', async () => {
    const source = new sut.BacklogSource(logger);
    await expect(
      source.checkConnection({
        apiKey: '',
        space: 'space',
        project_id: null,
        cutoff_days: 90,
      } as any)
    ).resolves.toStrictEqual([false, new VError('No API key provided')]);
  });

  test('streams - issues, use full_refresh sync mode', async () => {
    const fnIssuesFunc = jest.fn();

    Backlog.instance = jest.fn().mockImplementation(() => {
      const issuesResource: any[] = readTestFileAsJSON('issues.json');
      return new Backlog(
        {
          get: fnIssuesFunc.mockResolvedValue({
            data: issuesResource,
          }),
        } as any,
        {} as BacklogConfig,
        new Date('2010-03-27T14:03:51-0800')
      );
    });
    const source = new sut.BacklogSource(logger);
    const streams = source.streams({} as any);

    const issuesStream = streams[0];
    const issueIter = issuesStream.readRecords(SyncMode.FULL_REFRESH);
    const issues = [];
    for await (const issue of issueIter) {
      issues.push(issue);
    }

    expect(fnIssuesFunc).toHaveBeenCalledTimes(4);
    expect(issues).toStrictEqual(readTestFileAsJSON('issues.json'));
  });

  test('streams - projects, use full_refresh sync mode', async () => {
    const fnProjectsFunc = jest.fn();

    Backlog.instance = jest.fn().mockImplementation(() => {
      const projectsResource: any[] = readTestFileAsJSON('projects.json');
      return new Backlog(
        {
          get: fnProjectsFunc.mockResolvedValue({
            data: projectsResource,
          }),
        } as any,
        {} as BacklogConfig,
        new Date('2010-03-27T14:03:51-0800')
      );
    });
    const source = new sut.BacklogSource(logger);
    const streams = source.streams({} as any);

    const projectsStream = streams[1];
    const projectIter = projectsStream.readRecords(SyncMode.FULL_REFRESH);
    const projects = [];
    for await (const project of projectIter) {
      projects.push(project);
    }

    expect(fnProjectsFunc).toHaveBeenCalledTimes(2);
    expect(projects).toStrictEqual(readTestFileAsJSON('projects.json'));
  });

  test('streams - users, use full_refresh sync mode', async () => {
    const fnUsersFunc = jest.fn();

    Backlog.instance = jest.fn().mockImplementation(() => {
      const usersResource: any[] = readTestFileAsJSON('users.json');
      return new Backlog(
        {
          get: fnUsersFunc.mockResolvedValue({
            data: usersResource,
          }),
        } as any,
        {} as BacklogConfig,
        new Date('2010-03-27T14:03:51-0800')
      );
    });
    const source = new sut.BacklogSource(logger);
    const streams = source.streams({} as any);

    const usersStream = streams[2];
    const userIter = usersStream.readRecords(SyncMode.FULL_REFRESH);
    const users = [];
    for await (const user of userIter) {
      users.push(user);
    }

    expect(fnUsersFunc).toHaveBeenCalledTimes(1);
    expect(users).toStrictEqual(readTestFileAsJSON('users.json'));
  });
});
