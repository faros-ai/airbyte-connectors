import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  SyncMode,
  readResourceFile,
  readResourceAsJSON,
  readTestResourceFile,
  readTestResourceAsJSON,
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
        100,
        []
      );
    });

    const source = new sut.AsanaSource(logger);
    await expect(
      source.checkConnection({credentials: {personal_access_token: 'token'}})
    ).resolves.toStrictEqual([true, undefined]);
  });

  const config = {credentials: {personal_access_token: 'token'}};

  const testStream = async (streamName, expectedData): Promise<void> => {
    const fnList = jest.fn();

    Asana.instance = jest.fn().mockImplementation(() => {
      return new Asana(
        {
          get: fnList.mockResolvedValue({data: expectedData}),
        } as any,
        '2021-01-01',
        '2021-01-02',
        ['w1'],
        100,
        []
      );
    });

    const source = new sut.AsanaSource(logger);
    const streams = source.streams(config);
    const stream = streams.find((s) => s.name === streamName);
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
    await testStream('projects', expectedProjects);
  });

  test('streams - tags', async () => {
    const expectedTags = {data: [{gid: 't1', name: 'tag1'}]};
    await testStream('tags', expectedTags);
  });

  test('streams - users', async () => {
    const expectedUsers = {
      data: [{gid: 'u1', name: 'user1', email: 'user1@me.com'}],
    };
    await testStream('users', expectedUsers);
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
        100,
        []
      );
    });

    const source = new sut.AsanaSource(logger);
    const streams = source.streams(config);
    const stream = streams.find((s) => s.name === 'tasks');
    const tasks = stream.readRecords(SyncMode.FULL_REFRESH, undefined, {
      workspace: 'workspace1',
    });

    const items = [];
    for await (const item of tasks) {
      items.push(item);
    }

    expect(items).toMatchSnapshot();
  });

  test('streams - workspaces', async () => {
    const expectedWorkspaces = {data: [{gid: 'w1', name: 'workspace1'}]};
    await testStream('workspaces', expectedWorkspaces);
  });

  test('streams - project tasks', async () => {
    const expectedProjects = {data: [{gid: 'p1', name: 'project1'}]};
    const expectedTasks = {data: [{gid: 't1', name: 'task1'}]};

    Asana.instance = jest.fn().mockImplementation(() => {
      return new Asana(
        {
          get: jest
            .fn()
            .mockImplementation(async (path: string): Promise<any> => {
              if (path.startsWith('workspaces/workspace1/projects')) {
                return {data: expectedProjects};
              } else if (path.startsWith('projects/p1/tasks')) {
                return {data: expectedTasks};
              }
            }),
        } as any,
        '2021-01-01',
        '2021-01-02',
        ['w1'],
        100,
        []
      );
    });

    const source = new sut.AsanaSource(logger);
    const streams = source.streams(config);
    const stream = streams.find((s) => s.name === 'project_tasks');
    const tasks = stream.readRecords(SyncMode.FULL_REFRESH, undefined, {
      project: 'p1',
    });

    const items = [];
    for await (const item of tasks) {
      items.push(item);
    }

    expect(items).toMatchSnapshot();
  });

  describe('onBeforeRead filters project_tasks', () => {
    const catalog = {
      streams: [
        {
          stream: {name: 'project_tasks', json_schema: {}},
          sync_mode: SyncMode.FULL_REFRESH,
        },
        {
          stream: {name: 'projects', json_schema: {}},
          sync_mode: SyncMode.FULL_REFRESH,
        },
        {
          stream: {name: 'tasks', json_schema: {}},
          sync_mode: SyncMode.INCREMENTAL,
        },
      ],
    };
    test('sync project_tasks when missing state', async () => {
      const {catalog: newCatalog} = await source.onBeforeRead(
        config,
        catalog,
        {}
      );
      expect(newCatalog).toMatchSnapshot();
    });
    test('sync project_tasks when project_tasks_max_staleness_hours is 0', async () => {
      const {catalog: newCatalog} = await source.onBeforeRead(config, catalog, {
        project_tasks: {lastComputedAt: 1638470400000},
      });
      expect(newCatalog).toMatchSnapshot();
      const {catalog: newCatalog2} = await source.onBeforeRead(
        {...config, project_tasks_max_staleness_hours: 0},
        catalog,
        {project_tasks: {lastComputedAt: 1638470400000}}
      );
      expect(newCatalog2).toMatchSnapshot();
    });
    test('sync project_tasks when stale', async () => {
      const {catalog: newCatalog} = await source.onBeforeRead(
        {...config, project_tasks_max_staleness_hours: 1},
        catalog,
        {project_tasks: {lastComputedAt: Date.now() - 1000 * 60 * 60 * 2}}
      );
      expect(newCatalog).toMatchSnapshot();
      const {catalog: newCatalog2} = await source.onBeforeRead(
        {...config, project_tasks_max_staleness_hours: 3},
        catalog,
        {project_tasks: {lastComputedAt: Date.now() - 1000 * 60 * 60 * 2}}
      );
      expect(newCatalog2).toMatchSnapshot();
    });
    test('does not sync project_tasks when optimize_fetching_projects_and_tasks_with_full_tasks_sync', async () => {
      const {catalog: newCatalog} = await source.onBeforeRead(
        {
          ...config,
          optimize_fetching_projects_and_tasks_with_full_tasks_sync: true,
        },
        catalog,
        {}
      );
      expect(newCatalog).toMatchSnapshot();
    });
  });
});
