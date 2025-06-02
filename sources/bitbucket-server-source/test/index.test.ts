import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  SyncMode
} from 'faros-airbyte-cdk';
import {
  readResourceAsJSON
} from 'faros-airbyte-testing-tools';
import {VError} from 'verror';

import {BitbucketServer} from '../src/bitbucket-server';
import {Prefix as MEP} from '../src/bitbucket-server/more-endpoint-methods';
import * as sut from '../src/index';


describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  test('spec', async () => {
    const source = new sut.BitbucketServerSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceAsJSON('spec.json'))
    );
  });

  test('check connection - invalid', async () => {
    const source = new sut.BitbucketServerSource(logger);
    await expect(source.checkConnection({} as any)).resolves.toStrictEqual([
      false,
      new VError('server_url must be a valid url'),
    ]);
  });

  test('check connection', async () => {
    BitbucketServer.instance = jest.fn().mockImplementation(() => {
      return new BitbucketServer(
        {api: {getUsers: jest.fn().mockResolvedValue({})}} as any,
        {} as any,
        100,
        5,
        logger,
        new Date('2010-03-27T14:03:51-0800'),
        1,
        1
      );
    });

    const source = new sut.BitbucketServerSource(logger);
    await expect(
      source.checkConnection({
        server_url: 'localhost',
        token: 'token',
        projects: ['PLAYG'],
        cutoff_days: 90,
      })
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('streams - projects, use full_refresh sync mode', async () => {
    const fnProjectsFunc = jest.fn();
    const testProject = {key: 'PROJ1', name: 'Project1'};

    BitbucketServer.instance = jest.fn().mockImplementation(() => {
      return new BitbucketServer(
        {
          [MEP]: {
            projects: {
              getProjects: fnProjectsFunc.mockResolvedValue({
                data: {values: [testProject]},
              }),
              getProject: jest.fn().mockResolvedValue({data: testProject}),
            },
          },
          hasNextPage: jest.fn(),
        } as any,
        {} as any,
        100,
        5,
        logger,
        new Date('2010-03-27T14:03:51-0800'),
        1,
        1
      );
    });
    const source = new sut.BitbucketServerSource(logger);
    const streams = source.streams({} as any);
    const projectsStream = streams[2];
    const iter = projectsStream.readRecords(SyncMode.FULL_REFRESH);
    const projects = [];
    for await (const project of iter) {
      projects.push(project);
    }
    expect(fnProjectsFunc).toHaveBeenCalledTimes(1);
    expect(JSON.parse(JSON.stringify(projects))).toStrictEqual([testProject]);
  });

  test('streams - repositories, use full_refresh sync mode with bucketing', async () => {
    const fnReposFunc = jest.fn();
    BitbucketServer.instance = jest.fn().mockImplementation(() => {
      return new BitbucketServer(
        {
          [MEP]: {
            projects: {
              getRepositories: fnReposFunc.mockResolvedValue({
                data: {values: [{slug: 'repo1'}, {slug: 'repo2'}]},
              }),
            },
          },
          repos: {
            getDefaultBranch: jest
              .fn()
              .mockResolvedValue({data: {displayId: 'main'}}),
          },
          hasNextPage: jest.fn(),
        } as any,
        {} as any,
        100,
        5,
        logger,
        new Date('2010-03-27T14:03:51-0800'),
        1,
        2
      );
    });
    const source = new sut.BitbucketServerSource(logger);
    const streams = source.streams({repositories: ['PROJ1/repo1']} as any);
    const projectsStream = streams[6];
    const iter = projectsStream.readRecords(SyncMode.FULL_REFRESH, null, {
      projectKey: 'PROJ1',
    });
    const repos = [];
    for await (const repo of iter) {
      repos.push(repo);
    }
    expect(fnReposFunc).toHaveBeenCalledTimes(1);
    expect(JSON.parse(JSON.stringify(repos))).toStrictEqual([
      {
        slug: 'repo1',
        computedProperties: {fullName: 'proj1/repo1', mainBranch: 'main'},
      },
    ]);
  });
});
