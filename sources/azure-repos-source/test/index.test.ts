import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  SyncMode
} from 'faros-airbyte-cdk';
import {
  readResourceAsJSON,
  readTestFileAsJSON,
  sourceCheckTest
} from 'faros-airbyte-testing-tools';
import {AzureDevOpsClient} from 'faros-airbyte-common/azure-devops';
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
  const instanceType = 'cloud';
  const config = {
    access_token: 'token',
    organization: 'organization',
    projects: ['project'],
  } as AzureReposConfig;

  beforeEach(() => {
    AzureRepos.instance = azureRepo;
  });


  test('spec', async () => {
    const source = new sut.AzureRepoSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceAsJSON('spec.json'))
    );
  });

  test('check connection', async () => {
    AzureRepos.instance = jest.fn().mockImplementation(() => {
      const usersResource: any[] = readTestFileAsJSON('users.json');
      const project = {id: 'project', name: 'Project'};
      return new AzureRepos(
        {
          core: {
            getProject: jest.fn().mockResolvedValue(project),
          },
          git: {
            getRepositories: jest
              .fn()
              .mockResolvedValue([{id: 'repo', name: 'repo', project}]),
            getBranches: jest.fn().mockResolvedValue([]),
            getRefs: jest.fn().mockResolvedValue([]),
          },
          graph: {
            get: jest.fn().mockResolvedValue({
              data: {value: usersResource},
            }),
          },
        } as unknown as AzureDevOpsClient,
        instanceType,
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
        instanceType,
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
        instanceType,
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
    const repos = readTestFileAsJSON('repositories.json');
    const repo = {...repos[0], project: {id: 'project', name: 'project'}};
    AzureRepos.instance = jest.fn().mockImplementation(() => {
      const commits = readTestFileAsJSON('commits.json');
      return new AzureRepos(
        {
          git: {
            getCommits: jest.fn().mockResolvedValueOnce(commits),
          },
        } as unknown as AzureDevOpsClient,
        instanceType,
        cutoffDays,
        top,
        logger,
        ALL_BRANCHES_PATTERN
      );
    });
    const source = new sut.AzureRepoSource(logger);
    const streams = source.streams(config);

    const commitsStream = streams[0];
    const commitIter = commitsStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      {repository: repo, branch: 'main'}
    );
    const commits = [];
    for await (const pullrequest of commitIter) {
      commits.push(pullrequest);
    }
    expect(commits).toMatchSnapshot();
  });

  test('streams - commits, fetch branch commits', async () => {
    AzureRepos.instance = jest.fn().mockImplementation(() => {
      const reposResource = readTestFileAsJSON('repositories.json');
      const repos = reposResource.map((repo) =>
        omit(repo, ['branches', 'tags'])
      );
      const commits = readTestFileAsJSON('commits.json');
      const branches = readTestFileAsJSON('branches.json');
      return new AzureRepos(
        {
          core: {
            getProject: jest
              .fn()
              .mockResolvedValueOnce({id: 'project', name: 'project'}),
          },
          git: {
            getRepositories: jest.fn().mockResolvedValueOnce(repos),
            getCommits: jest.fn().mockResolvedValue(commits),
            getBranches: jest.fn().mockResolvedValueOnce(branches),
          },
        } as unknown as AzureDevOpsClient,
        instanceType,
        cutoffDays,
        top,
        logger,
        ALL_BRANCHES_PATTERN,
        [],
        false,
        true
      );
    });
    const source = new sut.AzureRepoSource(logger);
    const streams = source.streams(config);

    const commitsStream = streams[0];
    const commits = [];
    const syncMode = SyncMode.FULL_REFRESH;
    for await (const slice of commitsStream.streamSlices(syncMode)) {
      const commitIter = commitsStream.readRecords(syncMode, undefined, slice);
      for await (const commit of commitIter) {
        commits.push(commit);
      }
    }
    expect(commits).toMatchSnapshot();
  });

  test('streams - pullrequests, use full_refresh sync mode', async () => {
    const repos = readTestFileAsJSON('repositories.json');
    const repo = {...repos[0], project: {id: 'project', name: 'project'}};
    AzureRepos.instance = jest.fn().mockImplementation(() => {
      const rawPullrequests: any[] = readTestFileAsJSON('pullrequests.json');
      const pullrequests = rawPullrequests.map((p) => omit(p, 'threads'));
      const threads = rawPullrequests.map((r) => r.threads);
      return new AzureRepos(
        {
          git: {
            getPullRequests: jest.fn().mockResolvedValueOnce(pullrequests),
            getThreads: jest
              .fn()
              .mockResolvedValueOnce(threads[0])
              .mockResolvedValueOnce(threads[1]),
          },
        } as unknown as AzureDevOpsClient,
        instanceType,
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
      SyncMode.FULL_REFRESH,
      undefined,
      {repository: repo, branch: 'main'}
    );
    const pullrequests = [];
    for await (const pullrequest of pullrequestIter) {
      pullrequests.push(pullrequest);
    }
    expect(pullrequests).toMatchSnapshot();
  });

  test('streams - repositories, use full_refresh sync mode', async () => {
    AzureRepos.instance = jest.fn().mockImplementation(() => {
      const reposResource = readTestFileAsJSON('repositories.json');
      const repos = reposResource.map((repo) =>
        omit(repo, ['branches', 'tags'])
      );

      const tagResult = reposResource[0].tags[0];
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
            getBranches: jest.fn().mockResolvedValue(reposResource[0].branches),
            getRefs: jest.fn().mockResolvedValue([tag]),
            getAnnotatedTag: jest.fn().mockResolvedValue(tagResult.commit),
          },
        } as unknown as AzureDevOpsClient,
        instanceType,
        cutoffDays,
        top,
        logger,
        ALL_BRANCHES_PATTERN,
        [],
        true
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

  test('streams - repositories, filter by repository', async () => {
    AzureRepos.instance = jest.fn().mockImplementation(() => {
      const reposResource = readTestFileAsJSON('repositories.json');
      const repos = reposResource.map((repo) =>
        omit(repo, ['branches', 'tags'])
      );

      const tagResult = reposResource[0].tags[0];
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
            getBranches: jest.fn().mockResolvedValue(reposResource[0].branches),
            getRefs: jest.fn().mockResolvedValue([tag]),
            getAnnotatedTag: jest.fn().mockResolvedValue(tagResult.commit),
          },
        } as unknown as AzureDevOpsClient,
        instanceType,
        cutoffDays,
        top,
        logger,
        ALL_BRANCHES_PATTERN,
        ['devcube/another-test.git']
      );
    });

    const source = new sut.AzureRepoSource(logger);
    const streams = source.streams({} as any);

    const repositoriesStream = streams[2];
    const repositoryIter = repositoriesStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      {name: 'devcube', id: 'bca8259d-36c6-4a40-bedf-b810d54c5ceb'}
    );
    const repositories = [];
    for await (const repository of repositoryIter) {
      repositories.push(repository);
    }
    expect(repositories).toHaveLength(0);
  });

  test('streams - repositories, tags disabled', async () => {
    AzureRepos.instance = jest.fn().mockImplementation(() => {
      const reposResource = readTestFileAsJSON('repositories.json');
      const repos = reposResource.map((repo) =>
        omit(repo, ['branches', 'tags'])
      );

      return new AzureRepos(
        {
          git: {
            getRepositories: jest.fn().mockResolvedValue(repos),
            getBranches: jest.fn().mockResolvedValue(reposResource[0].branches),
          },
        } as unknown as AzureDevOpsClient,
        instanceType,
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
