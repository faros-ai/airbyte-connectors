import axios from 'axios';
import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import {AzureActiveDirectory} from '../src/azureactivedirectory';
import * as sut from '../src/index';

const azureActiveDirectoryInstance = AzureActiveDirectory.instance;

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('index', () => {
  test('ok?', async () => {
    expect('OK').toEqual('OK');
  });
});

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

  test('spec', async () => {
    const source = new sut.AzureActiveDirectorySource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readTestResourceFile('spec.json'))
    );
  });

  test('check connection', async () => {
    AzureActiveDirectory.instance = jest.fn().mockImplementation(() => {
      return new AzureActiveDirectory({
        get: jest.fn().mockResolvedValue({}),
      } as any);
    });

    const source = new sut.AzureActiveDirectorySource(logger);
    await expect(
      source.checkConnection({
        client_id: 'client_id',
        client_secret: 'client_secret',
        namespace: 'namespace',
      })
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('check connection - no client_secret', async () => {
    const source = new sut.AzureActiveDirectorySource(logger);
    await expect(
      source.checkConnection({
        client_id: 'client_id',
        namespace: 'namespace',
      } as any)
    ).resolves.toStrictEqual([
      false,
      new VError('client_secret must be a not empty string'),
    ]);
  });

  test('streams - users, use full_refresh sync mode', async () => {
    const fnWorksFunc = jest.fn();

    AzureActiveDirectory.instance = jest.fn().mockImplementation(() => {
      const worksResource: any[] = readTestResourceFile('users.json');
      return new AzureActiveDirectory({
        get: fnWorksFunc.mockResolvedValue({
          data: {totalSize: worksResource.length, records: worksResource},
        }),
      } as any);
    });
    const source = new sut.AzureActiveDirectorySource(logger);
    const streams = source.streams({} as any);

    const worksStream = streams[0];
    const worksIter = worksStream.readRecords(SyncMode.FULL_REFRESH);
    const works = [];
    for await (const work of worksIter) {
      works.push(work);
    }

    expect(fnWorksFunc).toHaveBeenCalledTimes(1);
    expect(works).toStrictEqual(readTestResourceFile('users.json'));
  });

  test('streams - groups, use full_refresh sync mode', async () => {
    const fnWorksFunc = jest.fn();

    AzureActiveDirectory.instance = jest.fn().mockImplementation(() => {
      const worksResource: any[] = readTestResourceFile('groups.json');
      return new AzureActiveDirectory({
        get: fnWorksFunc.mockResolvedValue({
          data: {totalSize: worksResource.length, records: worksResource},
        }),
      } as any);
    });
    const source = new sut.AzureActiveDirectorySource(logger);
    const streams = source.streams({} as any);

    const worksStream = streams[1];
    const worksIter = worksStream.readRecords(SyncMode.FULL_REFRESH);
    const works = [];
    for await (const work of worksIter) {
      works.push(work);
    }

    expect(fnWorksFunc).toHaveBeenCalledTimes(1);
    expect(works).toStrictEqual(readTestResourceFile('groups.json'));
  });
});
