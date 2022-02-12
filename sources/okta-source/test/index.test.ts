import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import * as sut from '../src/index';
import {Okta, OktaConfig} from '../src/okta';

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
    const source = new sut.OktaSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readTestResourceFile('spec.json'))
    );
  });

  test('check connection bad token', async () => {
    const source = new sut.OktaSource(logger);
    await expect(
      source.checkConnection({
        token: 'secrettoken',
        domain_name: 'dev-12345678',
      })
    ).resolves.toStrictEqual([
      false,
      new VError(
        'Connection check failed. Please verify your token is correct. Error: API responded with status 401'
      ),
    ]);
  });

  // test('check connection good token', async () => {
  //   const source = new sut.OktaSource(logger);
  //   await expect(
  //     source.checkConnection({
  //       token: 'EDITME',
  //       domain_name: 'EDITME',
  //     })
  //   ).resolves.toStrictEqual([true, undefined]);
  // });

  // test('streams - users, use full_refresh sync mode', async () => {
  //   const fileName = 'users.json';
  //   const source = new sut.OktaSource(logger);
  //   const streams = source.streams({
  //     token: '',
  //     domain_name: '',
  //   });
  //   const stream = streams[0];
  //   const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
  //   const items = [];
  //   for await (const item of itemIter) {
  //     items.push(item);
  //   }
  //   expect(items).toStrictEqual(readTestResourceFile(fileName));
  // });

  // function readConfig(): OktaConfig {
  //   return readTestResourceFile('config.json') as OktaConfig;
  // }

  // test('streams - groups, use full_refresh sync mode', async () => {
  //   const fileName = 'groups.json';
  //   const source = new sut.OktaSource(logger);
  //   const streams = source.streams(readConfig());
  //   const stream = streams[1];
  //   const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
  //   const items = [];
  //   for await (const item of itemIter) {
  //     items.push(item);
  //   }
  //   expect(items).toStrictEqual(readTestResourceFile(fileName));
  // });
});
