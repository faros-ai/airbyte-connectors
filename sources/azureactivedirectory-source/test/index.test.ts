import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import {
  AzureActiveDirectory,
  AzureActiveDirectoryConfig,
} from '../src/azureactivedirectory';
import * as sut from '../src/index';

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

  test('check connection bad client id, client secret', async () => {
    const source = new sut.AzureActiveDirectorySource(logger);
    await expect(
      source.checkConnection({
        client_id: '',
        client_secret: '',
        namespace: '',
      })
    ).resolves.toStrictEqual([
      false,
      new VError(
        'Please verify your client id, client secret are correct. Error: Request failed with status code 401'
      ),
    ]);
  });

  test('check connection good token', async () => {
    const source = new sut.AzureActiveDirectorySource(logger);
    await expect(
      source.checkConnection({
        client_id: '',
        client_secret: '',
        namespace: '',
      })
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('streams - users, use full_refresh sync mode', async () => {
    const fileName = 'users.json';
    const source = new sut.AzureActiveDirectorySource(logger);
    const streams = source.streams({
      client_id: '',
      client_secret: '',
      namespace: '',
    });
    const stream = streams[0];
    const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
    const items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    expect(items).toStrictEqual(readTestResourceFile(fileName));
  });

  test('streams - groups, use full_refresh sync mode', async () => {
    const fileName = 'groups.json';
    const source = new sut.AzureActiveDirectorySource(logger);
    const streams = source.streams({
      client_id: '',
      client_secret: '',
      namespace: '',
    });
    const stream = streams[1];
    const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
    const items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    expect(items).toStrictEqual(readTestResourceFile(fileName));
  });
});
