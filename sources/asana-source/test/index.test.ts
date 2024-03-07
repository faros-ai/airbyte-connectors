import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import VError from 'verror';

import {Asana} from '../src/asana';
import * as sut from '../src/index';

describe('index', () => {
  const logger = new AirbyteSourceLogger(
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

  const config = {credentials: {personal_access_token: 'token'}};

  const testStream = async (streamIndex, expectedData) => {
    const fnList = jest.fn();

    Asana.instance = jest.fn().mockImplementation(() => {
      return new Asana(
        {
          get: fnList.mockResolvedValue({data: expectedData}),
        } as any,
        '2021-01-01',
        '2021-01-02',
        ['w1'],
        100
      );
    });

    const source = new sut.AsanaSource(logger);
    const streams = source.streams(config);
    const stream = streams[streamIndex];
    const iter = stream.readRecords(SyncMode.FULL_REFRESH, undefined, {
      workspace: 'workspace1',
    });

    const items = [];
    for await (const item of iter) {
      items.push(item);
    }

    expect(fnList).toHaveBeenCalledTimes(1);
    expect(items).toStrictEqual(expectedData.data);
  };

  test('streams - projects', async () => {
    const expectedProjects = {data: [{gid: 'p1', name: 'project1'}]};
    await testStream(0, expectedProjects);
  });

  test('streams - tags', async () => {
    const expectedTags = {data: [{gid: 't1', name: 'tag1'}]};
    await testStream(1, expectedTags);
  });

  test('streams - users', async () => {
    const expectedUsers = {
      data: [{gid: 'u1', name: 'user1', email: 'user1@me.com'}],
    };
    await testStream(3, expectedUsers);
  });

  test('streams - tasks', async () => {
    const expectedTasks = {
      data: [
        {
          gid: 't1',
          name: 'task1',
          workspace: {gid: 'w1'},
          modified_at: '2021-01-01T00:00:00.000Z',
        },
      ],
    };
    const expectedStories = {
      data: [
        {
          gid: 's1',
          resource_subtype: 'marked_complete',
          created_at: '2021-01-01T00:00:00.000Z',
        },
      ],
    };

    Asana.instance = jest.fn().mockImplementation(() => {
      return new Asana(
        {
          get: jest
            .fn()
            .mockImplementation(async (path: string): Promise<any> => {
              if (path.startsWith('workspaces/workspace1/tasks/search')) {
                return {data: expectedTasks};
              } else if (path.startsWith('tasks/t1/stories')) {
                return {data: expectedStories};
              }
            }),
        } as any,
        '2021-01-01',
        '2021-01-02',
        ['w1'],
        100
      );
    });

    const source = new sut.AsanaSource(logger);
    const streams = source.streams(config);
    const stream = streams[2];
    const tasks = stream.readRecords(SyncMode.FULL_REFRESH, undefined, {
      workspace: 'workspace1',
    });

    const items = [];
    for await (const item of tasks) {
      items.push(item);
    }

    expect(items).toMatchSnapshot();
  });
});

function readResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
}
