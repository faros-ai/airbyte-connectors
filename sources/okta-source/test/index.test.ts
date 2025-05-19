import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import {readResourceFile} from 'faros-airbyte-common/common';
import fs from 'fs-extra';

import * as sut from '../src/index';
import {Okta} from '../src/okta';

function readTestResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
}

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  test('spec', async () => {
    const source = new sut.OktaSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection bad token', async () => {
    const source = new sut.OktaSource(logger);
    const res = await source.checkConnection({
      token: 'secrettoken',
      domain_name: 'dev-12345678',
    });
    expect(res[0]).toBe(false);
    expect(res[1]).toBeDefined();
    expect(res[1].message).toMatch(
      /Connection check failed. Please verify your token is correct. Error: API responded with status 401/
    );
  });

  test('check connection good token', async () => {
    Okta.instance = jest.fn().mockImplementation(() => {
      return new Okta(
        {get: jest.fn().mockResolvedValue({data: []})} as any,
        logger
      );
    });
    const source = new sut.OktaSource(logger);
    await expect(
      source.checkConnection({token: '', domain_name: ''})
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('streams - users, use full_refresh sync mode', async () => {
    const users = readTestResourceFile('users.json');
    Okta.instance = jest.fn().mockImplementation(() => {
      return new Okta(
        {get: jest.fn().mockResolvedValue({data: users})} as any,
        logger
      );
    });

    const source = new sut.OktaSource(logger);
    const streams = source.streams({
      token: '',
      domain_name: '',
    });
    const stream = streams[0];
    const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
    const items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    expect(items).toStrictEqual(users);
  });
});
