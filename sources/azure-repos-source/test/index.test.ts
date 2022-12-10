import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import {
  AzureRepos,
  DEFAULT_MAX_COMMITS_PER_BRANCH,
  DEFAULT_PAGE_SIZE,
} from '../src/azure-repos';
import * as sut from '../src/index';

const azureRepo = AzureRepos.make;

jest.mock('axios');

describe('index', () => {
  const logger = new AirbyteLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.INFO
  );

  beforeEach(() => {
    AzureRepos.make = azureRepo;
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
    AzureRepos.make = jest.fn().mockImplementation(() => {
      const repositoriesResource: any[] =
        readTestResourceFile('repositories.json');
      return new AzureRepos(
        DEFAULT_PAGE_SIZE,
        DEFAULT_MAX_COMMITS_PER_BRANCH,
        {
          get: jest.fn().mockResolvedValueOnce({
            data: {value: repositoriesResource},
          }),
        } as any,
        null
      );
    });
    const source = new sut.AzureRepoSource(logger);
    await expect(
      source.checkConnection({
        access_token: '',
        organization: 'organization',
        project: 'project',
      } as any)
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('check connection - no access token', async () => {
    const source = new sut.AzureRepoSource(logger);
    await expect(
      source.checkConnection({
        access_token: '',
        organization: 'organization',
        project: 'project',
      } as any)
    ).resolves.toStrictEqual([
      false,
      new VError('access_token must not be an empty string'),
    ]);
  });

  test('streams - repositories, use full_refresh sync mode', async () => {
    const fnRepositoriesFunc = jest.fn();

    AzureRepos.make = jest.fn().mockImplementation(() => {
      const repositoriesResource: any[] =
        readTestResourceFile('repositories.json');
      return new AzureRepos(
        DEFAULT_PAGE_SIZE,
        DEFAULT_MAX_COMMITS_PER_BRANCH,
        {
          get: fnRepositoriesFunc.mockResolvedValueOnce({
            data: {value: repositoriesResource},
          }),
        } as any,
        null
      );
    });
    const source = new sut.AzureRepoSource(logger);
    const streams = source.streams({} as any);

    const repositoriesStream = streams[0];
    const repositoryIter = repositoriesStream.readRecords(
      SyncMode.FULL_REFRESH
    );
    const repositories = [];
    for await (const repository of repositoryIter) {
      repositories.push(repository);
    }
    expect(fnRepositoriesFunc).toHaveBeenCalledTimes(3);
    expect(repositories.map((r) => r.id)).toStrictEqual(
      readTestResourceFile('repositories.json').map((r) => r.id)
    );
  });
  test('streams - pullrequests, use full_refresh sync mode', async () => {
    const fnPullrequestsFunc = jest.fn();

    AzureRepos.make = jest.fn().mockImplementation(() => {
      const pullrequestsResource: any[] =
        readTestResourceFile('pullrequests.json');
      return new AzureRepos(
        1,
        DEFAULT_MAX_COMMITS_PER_BRANCH,
        {
          get: fnPullrequestsFunc
            .mockResolvedValueOnce({
              data: {value: [pullrequestsResource[0]]},
            })
            .mockResolvedValueOnce({
              data: {value: [pullrequestsResource[1]]},
            })
            .mockResolvedValueOnce({
              data: {value: []},
            }),
        } as any,
        null
      );
    });
    const source = new sut.AzureRepoSource(logger);
    const streams = source.streams({} as any);

    const pullrequestsStream = streams[1];
    const pullrequestIter = pullrequestsStream.readRecords(
      SyncMode.FULL_REFRESH
    );
    const pullrequests = [];
    for await (const pullrequest of pullrequestIter) {
      pullrequests.push(pullrequest);
    }
    expect(fnPullrequestsFunc).toHaveBeenCalledTimes(7);
    expect(pullrequests.map((p) => p.pullRequestId)).toStrictEqual(
      readTestResourceFile('pullrequests.json').map((p) => p.pullRequestId)
    );
  });

  test('streams - users, use full_refresh sync mode', async () => {
    const fnUsersFunc = jest.fn();

    AzureRepos.make = jest.fn().mockImplementation(() => {
      const usersResource: any[] = readTestResourceFile('users.json');
      return new AzureRepos(
        DEFAULT_PAGE_SIZE,
        DEFAULT_MAX_COMMITS_PER_BRANCH,
        null,
        {
          get: fnUsersFunc.mockResolvedValue({
            data: {value: usersResource},
          }),
        } as any
      );
    });
    const source = new sut.AzureRepoSource(logger);
    const streams = source.streams({} as any);

    const usersStream = streams[2];
    const userIter = usersStream.readRecords(SyncMode.FULL_REFRESH);
    const users = [];
    for await (const user of userIter) {
      users.push(user);
    }
    expect(fnUsersFunc).toHaveBeenCalledTimes(1);
    expect(users.map((u) => u.principalName)).toStrictEqual(
      readTestResourceFile('users.json').map((u) => u.principalName)
    );
  });
});
