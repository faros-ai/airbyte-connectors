import {AxiosRequestConfig} from 'axios';
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
import {VError} from 'verror';

import {ClickUp} from '../src/clickup';
import * as sut from '../src/index';

function readResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
}

describe('index', () => {
  const logger = new AirbyteSourceLogger(
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
          get: jest.fn().mockResolvedValue({data: {teams: [{id: 'w1'}]}}),
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
    const expected = {
      folders: [
        {id: 'folder1', name: 'Folder 1'},
        {id: 'folder2', name: 'Folder 2'},
      ],
    };

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
    const expected = {
      goals: [
        {id: 'goal1', name: 'goal1'},
        {id: 'goal2', name: 'goal2'},
      ],
      folders: [
        {
          id: 'goalfolder1',
          name: 'Goal Folder 1',
          goals: [
            {id: 'foldergoal1', name: 'foldergoal1'},
            {id: 'foldergoal2', name: 'foldergoal2'},
          ],
        },
      ],
    };

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

  const fetchLists =
    (expected: any) =>
    async (path: string, conf: AxiosRequestConfig): Promise<any> => {
      return {
        data: {
          lists: expected.lists.filter(
            (l) => l.archived === (conf.params.archived ?? false)
          ),
        },
      };
    };

  test('streams - lists', async () => {
    const fnListLists = jest.fn();
    const expected = {
      lists: [
        {id: 'list1', name: 'List 1', archived: false},
        {id: 'list2', name: 'List 2', archived: false},
        {id: 'list3', name: 'List 3', archived: true},
      ],
    };

    ClickUp.instance = jest.fn().mockImplementation(() => {
      return new ClickUp(
        logger,
        {get: fnListLists.mockImplementation(fetchLists(expected))} as any,
        new Date('2010-03-27T14:03:51-0800'),
        1
      );
    });

    const source = new sut.ClickUpSource(logger);
    const spaces = source.streams(config)[2];
    const iter = spaces.readRecords(SyncMode.FULL_REFRESH, undefined, {
      workspaceId: 'workspace1',
      parent: {type: 'space', id: 'space1'},
    });
    const items = [];
    for await (const item of iter) {
      items.push(item);
    }
    expect(fnListLists).toHaveBeenCalledTimes(1);
    expect(items).toStrictEqual(
      expected.lists
        .filter((l) => l.archived === false)
        .map((l) => {
          return {computedProperties: {workspace: {id: 'workspace1'}}, ...l};
        })
    );
  });

  test('streams - lists, fetch archived', async () => {
    const fnListLists = jest.fn();
    const expected = {
      lists: [
        {id: 'list1', name: 'List 1', archived: false},
        {id: 'list2', name: 'List 2', archived: false},
        {id: 'list3', name: 'List 3', archived: true},
      ],
    };

    ClickUp.instance = jest.fn().mockImplementation(() => {
      return new ClickUp(
        logger,
        {get: fnListLists.mockImplementation(fetchLists(expected))} as any,
        new Date('2010-03-27T14:03:51-0800'),
        1
      );
    });

    const source = new sut.ClickUpSource(logger);
    const spaces = source.streams({...config, fetch_archived: true})[2];
    const iter = spaces.readRecords(SyncMode.FULL_REFRESH, undefined, {
      workspaceId: 'workspace1',
      parent: {type: 'space', id: 'space1'},
    });
    const items = [];
    for await (const item of iter) {
      items.push(item);
    }
    expect(fnListLists).toHaveBeenCalledTimes(2);
    expect(items).toStrictEqual(
      expected.lists.map((l) => {
        return {computedProperties: {workspace: {id: 'workspace1'}}, ...l};
      })
    );
  });

  test('streams - spaces', async () => {
    const fnListSpaces = jest.fn();
    const expected = {
      spaces: [
        {id: 'space1', name: 'Space 1'},
        {id: 'space2', name: 'Space 2'},
      ],
    };

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

  test('streams - status histories, full sync mode', async () => {
    const fnListTasks = jest.fn();
    const expectedTasks = {
      tasks: [
        {
          id: 'task1',
          name: 'Task 1',
          archived: false,
          date_updated: `${Date.now()}`,
        },
      ],
    };
    const expectedStatusHistories = {
      task1: {status_history: [{status: 'open', total_time: {since: '0'}}]},
    };

    ClickUp.instance = jest.fn().mockImplementation(() => {
      return new ClickUp(
        logger,
        {
          get: fnListTasks.mockImplementation(
            async (path: string, conf: AxiosRequestConfig): Promise<any> => {
              {
                if (path.includes('bulk_time_in_status')) {
                  return {data: expectedStatusHistories};
                }
                if (conf.params.page > 0) {
                  return {data: {tasks: []}};
                }
                return {
                  data: {
                    tasks: expectedTasks.tasks.filter(
                      (l) =>
                        new Date(Number(l.date_updated)) >
                        new Date(Number(conf.params.date_updated_gt))
                    ),
                  },
                };
              }
            }
          ),
        } as any,
        new Date('2010-03-27T14:03:51-0800'),
        1
      );
    });

    const source = new sut.ClickUpSource(logger);
    const spaces = source.streams(config)[4];
    const iter = spaces.readRecords(SyncMode.FULL_REFRESH, undefined, {
      workspaceId: 'workspace1',
      listId: 'list1',
    });
    const items = [];
    for await (const item of iter) {
      items.push(item);
    }

    expect(fnListTasks).toHaveBeenCalledTimes(3);
    expect(items).toStrictEqual([
      {
        computedProperties: {
          task: {
            id: 'task1',
            archived: false,
            date_updated: expectedTasks.tasks[0].date_updated,
            list: {id: 'list1'},
            workspace: {id: 'workspace1'},
          },
        },
        status_history: expectedStatusHistories.task1.status_history,
      },
    ]);
  });

  test('streams - status histories, incremental sync mode', async () => {
    const fnListTasks = jest.fn();
    const expectedTasks = {
      tasks: [
        {id: 'task1', name: 'Task 1', archived: false, date_updated: `1`},
      ],
    };

    ClickUp.instance = jest.fn().mockImplementation(() => {
      return new ClickUp(
        logger,
        {
          get: fnListTasks.mockImplementation(
            async (path: string, conf: AxiosRequestConfig): Promise<any> => {
              {
                return {
                  data: {
                    tasks: expectedTasks.tasks.filter(
                      (l) =>
                        new Date(Number(l.date_updated)) >
                        new Date(Number(conf.params.date_updated_gt))
                    ),
                  },
                };
              }
            }
          ),
        } as any,
        new Date('2010-03-27T14:03:51-0800'),
        1
      );
    });

    const source = new sut.ClickUpSource(logger);
    const spaces = source.streams(config)[4];
    const iter = spaces.readRecords(
      SyncMode.INCREMENTAL,
      undefined,
      {
        workspaceId: 'workspace1',
        listId: 'list1',
      },
      {
        list1: {lastUpdateDate: '1'},
      }
    );
    const items = [];
    for await (const item of iter) {
      items.push(item);
    }

    expect(fnListTasks).toHaveBeenCalledTimes(1);
    expect(items).toStrictEqual([]);
  });

  const fetchTasks =
    (expected: any) =>
    async (path: string, conf: AxiosRequestConfig): Promise<any> => {
      if (conf.params.page > 0) {
        return {data: {tasks: []}};
      }
      return {
        data: {
          tasks: expected.tasks.filter(
            (l) =>
              new Date(Number(l.date_updated)) >
              new Date(Number(conf.params.date_updated_gt))
          ),
        },
      };
    };

  test('streams - tasks, full sync mode', async () => {
    const fnListTasks = jest.fn();
    const expected = {
      tasks: [
        {id: 'task1', name: 'Task 1', date_updated: '0'},
        {id: 'task2', name: 'Task 2', date_updated: `${Date.now()}`},
        {id: 'task3', name: 'Task 2', date_updated: `${Date.now()}`},
      ],
    };

    ClickUp.instance = jest.fn().mockImplementation(() => {
      return new ClickUp(
        logger,
        {get: fnListTasks.mockImplementation(fetchTasks(expected))} as any,
        new Date('2010-03-27T14:03:51-0800'),
        1
      );
    });

    const source = new sut.ClickUpSource(logger);
    const spaces = source.streams(config)[5];
    const iter = spaces.readRecords(SyncMode.FULL_REFRESH, undefined, {
      workspaceId: 'workspace1',
      listId: 'list1',
    });
    const items = [];
    for await (const item of iter) {
      items.push(item);
    }
    expect(fnListTasks).toHaveBeenCalledTimes(2);
    expect(items).toStrictEqual(
      expected.tasks
        .filter((t) => t.date_updated > '0')
        .map((s) => {
          return {computedProperties: {workspace: {id: 'workspace1'}}, ...s};
        })
    );
  });

  test('streams - tasks, incremental sync mode', async () => {
    const fnListTasks = jest.fn();
    const expected = {
      tasks: [
        {id: 'task1', name: 'Task 1', date_updated: '1'},
        {id: 'task2', name: 'Task 2', date_updated: '2'},
        {id: 'task3', name: 'Task 2', date_updated: '3'},
      ],
    };

    ClickUp.instance = jest.fn().mockImplementation(() => {
      return new ClickUp(
        logger,
        {get: fnListTasks.mockImplementation(fetchTasks(expected))} as any,
        new Date('2010-03-27T14:03:51-0800'),
        1
      );
    });

    const source = new sut.ClickUpSource(logger);
    const spaces = source.streams(config)[5];
    const iter = spaces.readRecords(
      SyncMode.INCREMENTAL,
      undefined,
      {
        workspaceId: 'workspace1',
        listId: 'list1',
      },
      {list1: {lastUpdatedDate: '1'}}
    );
    const items = [];
    for await (const item of iter) {
      items.push(item);
    }
    expect(fnListTasks).toHaveBeenCalledTimes(2);
    expect(items).toStrictEqual(
      expected.tasks
        .filter((t) => t.date_updated > '1')
        .map((s) => {
          return {computedProperties: {workspace: {id: 'workspace1'}}, ...s};
        })
    );
  });

  test('streams - workspaces', async () => {
    const fnListWorkspaces = jest.fn();
    const expected = {
      teams: [
        {id: 'workspace1', name: 'Workspace 1'},
        {id: 'workspace2', name: 'Workspace 2'},
      ],
    };

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
