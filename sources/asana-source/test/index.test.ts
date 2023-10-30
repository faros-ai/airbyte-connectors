import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import nock from 'nock';
import VError from 'verror';

import {Asana} from '../src/asana';
import * as sut from '../src/index';
import {AsanaResponse, Workspace} from '../src/models';

describe('index', () => {
  const logger = new AirbyteLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const source = new sut.AsanaSource(logger);

  test('spec', async () => {
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection - invalid', async () => {
    const source = new sut.AsanaSource(logger);
    await expect(source.checkConnection({} as any)).resolves.toStrictEqual([
      false,
      new VError('Please provide a personal access token'),
    ]);
  });

  test('check connection', async () => {
    Asana.instance = jest.fn().mockImplementation(() => {
      return new Asana(
        {
          get: jest.fn().mockResolvedValue({data: {data: [{gid: 'w1'}]}}),
        } as any,
        '2021-01-01',
        '2021-01-02',
        ['w1'],
        100
      );
    });

    const source = new sut.AsanaSource(logger);
    await expect(
      source.checkConnection({credentials: {personal_access_token: 'token'}})
    ).resolves.toStrictEqual([true, undefined]);
  });
});

function readResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
}

function readTestResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
}
