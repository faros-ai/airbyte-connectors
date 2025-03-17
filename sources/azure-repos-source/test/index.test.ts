import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  sourceCheckTest,
  SyncMode,
} from 'faros-airbyte-cdk';
import {AzureDevOpsClient} from 'faros-airbyte-common/azure-devops';
import fs from 'fs-extra';
import {omit} from 'lodash';

import {AzureRepos} from '../src/azure-repos';
import * as sut from '../src/index';
import {AzureReposConfig} from '../src/models';

const azureRepo = AzureRepos.instance;
const ALL_BRANCHES_PATTERN = '.*';

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.INFO
  );

  const cutoffDays = 3;
  const top = 100;
  const config = {
    access_token: 'token',
    organization: 'organization',
    projects: ['project'],
  } as AzureReposConfig;

  beforeEach(() => {
    AzureRepos.instance = azureRepo;
  });

  function readResourceFile(fileName: string): any {
    return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
  }

  function readTestResourceFile(fileName: string): any {
    return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
  }

  test('spec', async () => {
    const source = new sut.AzureRepoSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection', async () => {
    AzureRepos.instance = jest.fn().mockImplementation(() => {
      const usersResource: any[] = readTestResourceFile('users.json');
      return new AzureRepos(
        {
          core: {
            getProject: jest
              .fn()
              .mockResolvedValue({id: 'project', name: 'Project'}),
          },
          git: {
            getRepositories: jest
              .fn()
              .mockResolvedValue([{id: 'repo', name: 'repo'}]),
            getBranches: jest.fn().mockResolvedValue([]),
            getRefs: jest.fn().mockResolvedValue([]),
          },
          graph: {
            get: jest.fn().mockResolvedValue({
              data: {value: usersResource},
            }),
          },
        } as unknown as AzureDevOpsClient,
        cutoffDays,
        top,
        logger,
        ALL_BRANCHES_PATTERN
      );
    });

    const source = new sut.AzureRepoSource(logger);
    await sourceCheckTest({
      source,
      configOrPath: config,
    });
  });

  test('check connection - no projects', async () => {
    AzureRepos.instance = jest.fn().mockImplementation(() => {
      return new AzureRepos(
        {
          core: {
            getProject: jest.fn().mockResolvedValue(null),
          },
        } as unknown as AzureDevOpsClient,
        cutoffDays,
        top,
        logger,
        ALL_BRANCHES_PATTERN
      );
    });

    const source = new sut.AzureRepoSource(logger);
    await sourceCheckTest({
      source,
      configOrPath: config,
    });
  });

  test('check connection - no repositories', async () => {
    AzureRepos.instance = jest.fn().mockImplementation(() => {
      return new AzureRepos(
        {
          core: {
            getProject: jest
              .fn()
              .mockResolvedValue({id: 'project', name: 'Project'}),
          },
          git: {
            getRepositories: jest
              .fn()
              .mockRejectedValue(new Error('Failed to fetch repositories')),
          },
        } as unknown as AzureDevOpsClient,
        cutoffDays,
        top,
        logger,
        ALL_BRANCHES_PATTERN
      );
    });

    const source = new sut.AzureRepoSource(logger);
    await sourceCheckTest({
      source,
      configOrPath: config,
    });
  });

  test('streams - commits, use full_refresh sync mode', async () => {
    AzureRepos.instance = jest.fn().mockImplementation(() => {
      const repos = readTestResourceFile('repositories.json');
      const commits = readTestResourceFile('commits.json');
      return new AzureRepos(
        {
          core: {
            getProject: jest
              .fn()
              .mockResolvedValueOnce({id: 'project', name: 'project'}),
          },
          git: {
            getRepositories: jest.fn().mockResolvedValueOnce(repos),
            getCommits: jest.fn().mockResolvedValueOnce(commits),
          },
        } as unknown as AzureDevOpsClient,
        cutoffDays,
        top,
        logger,
        ALL_BRANCHES_PATTERN
      );
    });
    const source = new sut.AzureRepoSource(logger);
    const streams = source.streams(config);

    const commitsStream = streams[0];
    const commitIter = commitsStream.readRecords(SyncMode.FULL_REFRESH);
    const commits = [];
    for await (const pullrequest of commitIter) {
      commits.push(pullrequest);
    }
    expect(commits).toMatchSnapshot();
  });

  test('streams - pullrequests, use full_refresh sync mode', async () => {
    AzureRepos.instance = jest.fn().mockImplementation(() => {
      const repos = readTestResourceFile('repositories.json');
      const rawPullrequests: any[] = readTestResourceFile('pullrequests.json');
      const pullrequests = rawPullrequests.map((p) => omit(p, 'threads'));
      const threads = rawPullrequests.map((r) => r.threads);
      const branch = readTestResourceFile('branches.json')[0];
      return new AzureRepos(
        {
          core: {
            getProject: jest
              .fn()
              .mockResolvedValueOnce({id: 'project', name: 'project'}),
          },
          git: {
            getRepositories: jest.fn().mockResolvedValueOnce(repos),
            getBranches: jest.fn().mockResolvedValueOnce([branch]),
            getPullRequests: jest.fn().mockResolvedValueOnce(pullrequests),
            getThreads: jest
              .fn()
              .mockResolvedValueOnce(threads[0])
              .mockResolvedValueOnce(threads[1]),
          },
        } as unknown as AzureDevOpsClient,
        cutoffDays,
        top,
        logger,
        ALL_BRANCHES_PATTERN
      );
    });

    const source = new sut.AzureRepoSource(logger);
    const streams = source.streams(config);

    const pullrequestsStream = streams[1];
    const pullrequestIter = pullrequestsStream.readRecords(
      SyncMode.FULL_REFRESH
    );
    const pullrequests = [];
    for await (const pullrequest of pullrequestIter) {
      pullrequests.push(pullrequest);
    }
    expect(pullrequests).toMatchSnapshot();
  });

  test('streams - repositories, use full_refresh sync mode', async () => {
    AzureRepos.instance = jest.fn().mockImplementation(() => {
      const repos = readTestResourceFile('repositories.json');

      const tagResult = repos[0].tags[0];
      const tag = {
        name: tagResult.name,
        objectId: tagResult.objectId,
        creator: tagResult.creator,
        message: tagResult.message,
        url: tagResult.url,
        peeledObjectId: tagResult.commit.objectId,
      };

      return new AzureRepos(
        {
          git: {
            getRepositories: jest.fn().mockResolvedValue(repos),
            getBranches: jest.fn().mockResolvedValue(repos[0].branches),
            getRefs: jest.fn().mockResolvedValue([tag]),
            getAnnotatedTag: jest.fn().mockResolvedValue(tagResult.commit),
          },
        } as unknown as AzureDevOpsClient,
        cutoffDays,
        top,
        logger,
        ALL_BRANCHES_PATTERN
      );
    });

    const source = new sut.AzureRepoSource(logger);
    const streams = source.streams({} as any);

    const repositoriesStream = streams[2];
    const repositoryIter = repositoriesStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      {name: 'Project', id: 'project'}
    );
    const repositories = [];
    for await (const repository of repositoryIter) {
      repositories.push(repository);
    }
    expect(repositories).toMatchSnapshot();
  });
});
