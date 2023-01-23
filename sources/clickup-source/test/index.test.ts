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
      source.checkConnection({token: 'token', cutoff_days: -1})
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
      source.checkConnection({token: 'token', cutoff_days: 90})
    ).resolves.toStrictEqual([true, undefined]);
  });

  const config = {token: 'token', cutoff_days: 90, timeout: 1};

  test('streams - folders', async () => {
    const fnListFolders = jest.fn();
    const expected = readTestResourceFile('folders.json');

    ClickUp.instance = jest.fn().mockImplementation(() => {
      return new ClickUp(
        logger,
        {
          get: fnListFolders.mockResolvedValueOnce({data: expected}),
        } as any,
        new Date('2010-03-27T14:03:51-0800'),
        1
      );
    });

    const source = new sut.ClickUpSource(logger);
    const spaces = source.streams(config)[0];
    const iter = spaces.readRecords(SyncMode.FULL_REFRESH, undefined, {
      workspaceId: 'workspace1',
      spaceId: 'space1',
    });
    const items = [];
    for await (const item of iter) {
      items.push(item);
    }
    expect(fnListFolders).toHaveBeenCalledTimes(1);
    expect(items).toStrictEqual(
      expected.folders.map((f) => {
        return {computedProperties: {workspace: {id: 'workspace1'}}, ...f};
      })
    );
  });

  test('streams - goals', async () => {
    const fnListGoals = jest.fn();
    const expected = readTestResourceFile('goals.json');

    ClickUp.instance = jest.fn().mockImplementation(() => {
      return new ClickUp(
        logger,
        {
          get: fnListGoals.mockImplementation(
            async (path: string): Promise<any> => {
              if (path.startsWith('/team/')) {
                return {data: expected};
              }
              const goalId = path.replace('/goal/', '');
              return {data: {goal: {id: goalId, name: goalId}}};
            }
          ),
        } as any,
        new Date('2010-03-27T14:03:51-0800'),
        1
      );
    });

    const source = new sut.ClickUpSource(logger);
    const spaces = source.streams(config)[1];
    const iter = spaces.readRecords(SyncMode.FULL_REFRESH, undefined, {
      workspaceId: 'workspace1',
    });
    const items = [];
    for await (const item of iter) {
      items.push(item);
    }
    expect(fnListGoals).toHaveBeenCalledTimes(5);
    const expectedGoals = [...expected.goals];
    for (const folder of expected.folders) {
      expectedGoals.push(...folder.goals);
    }
    expect(items).toStrictEqual(
      expectedGoals.map((g) => {
        return {computedProperties: {workspace: {id: 'workspace1'}}, ...g};
      })
    );
  });

  test('streams - spaces', async () => {
    const fnListSpaces = jest.fn();
    const expected = readTestResourceFile('spaces.json');

    ClickUp.instance = jest.fn().mockImplementation(() => {
      return new ClickUp(
        logger,
        {
          get: fnListSpaces.mockResolvedValueOnce({data: expected}),
        } as any,
        new Date('2010-03-27T14:03:51-0800'),
        1
      );
    });

    const source = new sut.ClickUpSource(logger);
    const spaces = source.streams(config)[3];
    const iter = spaces.readRecords(SyncMode.FULL_REFRESH, undefined, {
      workspaceId: 'workspace1',
    });
    const items = [];
    for await (const item of iter) {
      items.push(item);
    }
    expect(fnListSpaces).toHaveBeenCalledTimes(1);
    expect(items).toStrictEqual(
      expected.spaces.map((s) => {
        return {computedProperties: {workspace: {id: 'workspace1'}}, ...s};
      })
    );
  });

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
    const workspaces = source.streams(config)[6];
    const iter = workspaces.readRecords(SyncMode.FULL_REFRESH);
    const items = [];
    for await (const item of iter) {
      items.push(item);
    }
    expect(fnListWorkspaces).toHaveBeenCalledTimes(1);
    expect(items).toStrictEqual(expected.teams);
  });
});
