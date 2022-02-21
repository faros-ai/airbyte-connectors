import axios from 'axios';
import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import {AzureGit} from '../src/azuregit';
import * as sut from '../src/index';

const azureGit = AzureGit.instance;

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('index', () => {
  test('ok?', async () => {
    expect('OK').toEqual('OK');
  });
});

describe('index', () => {
  const logger = new AirbyteLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  beforeEach(() => {
    AzureGit.instance = azureGit;
  });

  function readTestResourceFile(fileName: string): any {
    return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
  }

  test('spec', async () => {
    const source = new sut.AzureGitSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readTestResourceFile('spec.json'))
    );
  });

  test('check connection - no access token', async () => {
    const source = new sut.AzureGitSource(logger);
    await expect(
      source.checkConnection({
        access_token: '',
        organization: 'organization',
        project: 'project',
      } as any)
    ).resolves.toStrictEqual([
      false,
      new VError('access_token must be a not empty string'),
    ]);
  });

  test('streams - repositories, use full_refresh sync mode', async () => {
    const fnRepositoriesFunc = jest.fn();

    AzureGit.instance = jest.fn().mockImplementation(() => {
      const repositoriesResource: any[] =
        readTestResourceFile('repositories.json');
      return new AzureGit(
        {
          get: fnRepositoriesFunc.mockResolvedValue({
            data: {value: repositoriesResource},
          }),
        } as any,
        null,
        null
      );
    });
    const source = new sut.AzureGitSource(logger);
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
    expect(repositories).toStrictEqual(
      readTestResourceFile('repositories.json')
    );
  });
  test('streams - pullrequests, use full_refresh sync mode', async () => {
    const fnPullrequestsFunc = jest.fn();

    AzureGit.instance = jest.fn().mockImplementation(() => {
      const pullrequestsResource: any[] =
        readTestResourceFile('pullrequests.json');
      return new AzureGit(
        {
          get: fnPullrequestsFunc.mockResolvedValue({
            data: {value: pullrequestsResource},
          }),
        } as any,
        null,
        null
      );
    });
    const source = new sut.AzureGitSource(logger);
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
    expect(pullrequests).toStrictEqual(
      readTestResourceFile('pullrequests.json')
    );
  });

  test('streams - users, use full_refresh sync mode', async () => {
    const fnUsersFunc = jest.fn();

    AzureGit.instance = jest.fn().mockImplementation(() => {
      const usersResource: any[] = readTestResourceFile('users.json');
      return new AzureGit(
        null,
        {
          get: fnUsersFunc.mockResolvedValue({
            data: {value: usersResource},
          }),
        } as any,
        null
      );
    });
    const source = new sut.AzureGitSource(logger);
    const streams = source.streams({} as any);

    const usersStream = streams[2];
    const userIter = usersStream.readRecords(SyncMode.FULL_REFRESH);
    const users = [];
    for await (const user of userIter) {
      users.push(user);
    }
    expect(fnUsersFunc).toHaveBeenCalledTimes(1);
    expect(users).toStrictEqual(readTestResourceFile('users.json'));
  });
});
