import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import {ClickUp} from '../src/clickup';
import * as sut from '../src/index';

function readResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
}

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
    const source = new sut.ClickUpSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection - invalid', async () => {
    const source = new sut.ClickUpSource(logger);
    await expect(source.checkConnection({} as any)).resolves.toStrictEqual([
      false,
      new VError('token must not be an empty string'),
    ]);
    await expect(
      source.checkConnection({token: 'token'})
    ).resolves.toStrictEqual([
      false,
      new VError('cutoff_days must be a positive number'),
    ]);
    await expect(
      source.checkConnection({token: 'token', cutoff_days: 90, timeout: 0})
    ).resolves.toStrictEqual([
      false,
      new VError('timeout must be a positive number'),
    ]);
  });

  test('check connection', async () => {
    ClickUp.instance = jest.fn().mockImplementation(() => {
      return new ClickUp(
        logger,
        {
          get: jest
            .fn()
            .mockResolvedValue({data: readTestResourceFile('workspaces.json')}),
        } as any,
        new Date('2010-03-27T14:03:51-0800'),
        1
      );
    });

    const source = new sut.ClickUpSource(logger);
    await expect(
      source.checkConnection({token: 'token'})
    ).resolves.toStrictEqual([true, undefined]);
  });

  const config = {token: 'token', cutoff_days: 90, timeout: 1};

  test('streams - workspaces', async () => {
    const fnListWorkspaces = jest.fn();
    const expected = readTestResourceFile('workspaces.json');

    ClickUp.instance = jest.fn().mockImplementation(() => {
      return new ClickUp(
        logger,
        {
          get: fnListWorkspaces.mockResolvedValue({data: expected}),
        } as any,
        new Date('2010-03-27T14:03:51-0800'),
        1
      );
    });

    const source = new sut.ClickUpSource(logger);
    const workspaces = source.streams(config)[5];
    const iter = workspaces.readRecords(SyncMode.FULL_REFRESH);
    const items = [];
    for await (const item of iter) {
      items.push(item);
    }
    expect(fnListWorkspaces).toHaveBeenCalledTimes(1);
    expect(items).toStrictEqual(expected.teams);
  });
});
