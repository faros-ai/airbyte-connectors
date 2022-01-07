describe('index', () => {
  test('ok?', async () => {
    expect('OK').toEqual('OK');
  });
});
import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  redactConfig,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import * as sut from '../src/index';
import {Okta, OktaConfig} from '../src/okta';

const OktaInstance = Okta.instance;

function readTestResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
}
function readConfig(): OktaConfig {
  return readTestResourceFile('config.json') as OktaConfig;
}
describe('index', () => {
  const logger = new AirbyteLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  beforeEach(() => {
    Okta.instance = OktaInstance;
  });

  test('spec', async () => {
    const source = new sut.OktaSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readTestResourceFile('spec.json'))
    );
  });
  test('check connection', async () => {
    const source = new sut.OktaSource(logger);
    await expect(
      source.checkConnection({
        token: readConfig().token,
      })
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('check connection - incorrect token', async () => {
    const source = new sut.OktaSource(logger);
    await expect(source.checkConnection({token: ''})).resolves.toStrictEqual([
      false,
      new VError('Please verify your token are correct. Error: some error'),
    ]);
  });

  test('check connection - incorrect variables', async () => {
    const source = new sut.OktaSource(logger);
    await expect(source.checkConnection({})).resolves.toStrictEqual([
      false,
      new VError('token must be a not empty string'),
    ]);
  });

  test('streams - users, use full_refresh sync mode', async () => {
    const fileName = 'users.json';
    const source = new sut.OktaSource(logger);
    const streams = source.streams(readConfig());
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
    const source = new sut.OktaSource(logger);
    const streams = source.streams(readConfig());
    const stream = streams[1];
    const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
    const items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    expect(items).toStrictEqual(readTestResourceFile(fileName));
  });

  test('streams - logevents, use full_refresh sync mode', async () => {
    const fileName = 'log_events.json';
    const source = new sut.OktaSource(logger);
    const streams = source.streams(readConfig());
    const stream = streams[2];
    const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
    const items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    expect(items).toStrictEqual(readTestResourceFile(fileName));
  });
});
