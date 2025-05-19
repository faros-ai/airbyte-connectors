import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import {readResourceFile} from 'faros-airbyte-common/common';
import fs from 'fs-extra';
import {VError} from 'verror';

import {AzureActiveDirectory} from '../src/azureactivedirectory';
import * as sut from '../src/index';

const azureActiveDirectoryInstance = AzureActiveDirectory.instance;

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const source = new sut.AzureActiveDirectorySource(logger);

  beforeEach(() => {
    AzureActiveDirectory.instance = azureActiveDirectoryInstance;
  });



  function readTestResourceFile(fileName: string): any {
    return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
  }

  test('spec', async () => {
    const source = new sut.AzureActiveDirectorySource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection - no client_secret', async () => {
    const source = new sut.AzureActiveDirectorySource(logger);
    await expect(
      source.checkConnection({
        client_id: 'client_id',
        tenant_id: 'tenant_id',
      } as any)
    ).resolves.toStrictEqual([
      false,
      new VError('client_secret must not be an empty string'),
    ]);
  });

  test('filters groups stream when fetch_teams is false', async () => {
    const catalog = readTestResourceFile('full_configured_catalog.json');
    const {catalog: newCatalog} = await source.onBeforeRead(
      {fetch_teams: false} as any,
      catalog
    );
    expect(newCatalog).toMatchSnapshot();

    const {catalog: originalCatalog} = await source.onBeforeRead(
      {} as any,
      catalog
    );
    expect(originalCatalog).toMatchSnapshot();
  });

  test('streams - users, use full_refresh sync mode', async () => {
    const fnUsersFunc = jest.fn();

    AzureActiveDirectory.instance = jest.fn().mockImplementation(() => {
      const usersResource: any[] = readTestResourceFile('users.json');
      return new AzureActiveDirectory(
        {
          get: fnUsersFunc.mockResolvedValue({
            data: {value: usersResource},
          }),
        } as any,
        null
      );
    });
    const streams = source.streams({} as any);

    const usersStream = streams[0];
    const userIter = usersStream.readRecords(SyncMode.FULL_REFRESH);
    const users = [];
    for await (const user of userIter) {
      users.push(user);
    }

    expect(fnUsersFunc).toHaveBeenCalledTimes(3);
    expect(users).toStrictEqual(readTestResourceFile('users.json'));
  });

  test('streams - groups, use full_refresh sync mode', async () => {
    const fnGroupsFunc = jest.fn();

    AzureActiveDirectory.instance = jest.fn().mockImplementation(() => {
      const groupsResource: any[] = readTestResourceFile('groups.json');
      return new AzureActiveDirectory(
        {
          get: fnGroupsFunc.mockResolvedValue({
            data: {value: groupsResource},
          }),
        } as any,
        null
      );
    });
    const streams = source.streams({} as any);

    const groupsStream = streams[1];
    const groupsIter = groupsStream.readRecords(SyncMode.FULL_REFRESH);
    const groups = [];
    for await (const group of groupsIter) {
      groups.push(group);
    }

    expect(fnGroupsFunc).toHaveBeenCalledTimes(3);
    expect(groups).toStrictEqual(readTestResourceFile('groups.json'));
  });
});
