import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  sourceCheckTest,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';

import {AzureWorkitems} from '../src/azure-workitems';
import * as sut from '../src/index';

const azureWorkitem = AzureWorkitems.instance;

jest.mock('axios');

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.INFO
  );

  const source = new sut.AzureWorkitemsSource(logger);

  beforeEach(() => {
    AzureWorkitems.instance = azureWorkitem;
  });

  function readResourceFile(fileName: string): any {
    return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
  }

  function readTestResourceFile(fileName: string): any {
    return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
  }

  test('spec', async () => {
    const source = new sut.AzureWorkitemsSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection - valid config', async () => {
    AzureWorkitems.instance = jest.fn().mockImplementation(() => {
      const usersResource: any[] = readTestResourceFile('users.json');
      return new AzureWorkitems(
        null,
        null,
        null,
        {
          get: jest.fn().mockResolvedValue({
            data: {value: usersResource},
          }),
        } as any,
        new Map(),
        logger
      );
    });

    await sourceCheckTest({
      source,
      configOrPath: {
        access_token: 'access_token',
        organization: 'organization',
        project: 'project',
      },
    });
  });

  test('check connection - no access token', async () => {
    await sourceCheckTest({
      source,
      configOrPath: {
        access_token: '',
        organization: 'organization',
        project: 'project',
      },
    });
  });

  test('check connection - no organization', async () => {
    await sourceCheckTest({
      source,
      configOrPath: {
        access_token: 'access_token',
        organization: '',
        project: 'project',
      },
    });
  });

  test('check connection - custom api_url with no graph_api_url', async () => {
    await sourceCheckTest({
      source,
      configOrPath: {
        access_token: 'access_token',
        organization: 'organization',
        api_url: 'https://azure.myorg.com',
        project: 'project',
      },
    });
  });

  test('streams - users (cloud), use full_refresh sync mode', async () => {
    const fnUsersFunc = jest.fn();

    AzureWorkitems.instance = jest.fn().mockImplementation(() => {
      const usersResource: any[] = readTestResourceFile('users.json');
      return new AzureWorkitems(
        null,
        null,
        null,
        {
          get: fnUsersFunc.mockResolvedValue({
            data: {value: usersResource},
          }),
        } as any,
        new Map(),
        logger
      );
    });
    const source = new sut.AzureWorkitemsSource(logger);
    const streams = source.streams({} as any);

    const usersStream = streams[1];
    const userIter = usersStream.readRecords(SyncMode.FULL_REFRESH);
    const users = [];
    for await (const user of userIter) {
      users.push(user);
    }

    expect(fnUsersFunc).toHaveBeenCalledTimes(1);
    expect(users).toStrictEqual(readTestResourceFile('users.json'));
  });

  test('streams - users (server), use full_refresh sync mode', async () => {
    const fnUsersFunc = jest.fn();

    AzureWorkitems.instance = jest.fn().mockImplementation(() => {
      return new AzureWorkitems(
        {type: 'server'},
        null,
        {
          get: fnUsersFunc
            .mockResolvedValueOnce({
              data: readTestResourceFile('teams.json'),
            })
            .mockResolvedValue({
              data: readTestResourceFile('team_members.json'),
            }),
        } as any,
        null,
        new Map(),
        logger
      );
    });
    const source = new sut.AzureWorkitemsSource(logger);
    const streams = source.streams({} as any);

    const usersStream = streams[1];
    const userIter = usersStream.readRecords(SyncMode.FULL_REFRESH);
    const users = [];
    for await (const user of userIter) {
      users.push(user);
    }

    expect(fnUsersFunc).toHaveBeenCalledTimes(3);
    expect(users).toMatchSnapshot();
  });

  test('streams - iterations, use full_refresh sync mode', async () => {
    const fnIterationsFunc = jest.fn().mockImplementation((url) => {
      if (url.endsWith('classificationnodes/Iterations')) {
        return {data: readTestResourceFile('iterations_root.json')};
      } else if (url.endsWith('classificationNodes/Iterations/Release%201')) {
        return {data: readTestResourceFile('iterations_node_3.json')};
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    AzureWorkitems.instance = jest.fn().mockImplementation(() => {
      return new AzureWorkitems(
        null,
        null,
        {
          get: fnIterationsFunc,
        } as any,
        null,
        new Map(),
        logger
      );
    });
    const source = new sut.AzureWorkitemsSource(logger);
    const streams = source.streams({} as any);

    const iterationsStream = streams[2];
    const iterationsIter = iterationsStream.readRecords(SyncMode.FULL_REFRESH);
    const iterations = [];
    for await (const iteration of iterationsIter) {
      iterations.push(iteration);
    }

    expect(fnIterationsFunc).toHaveBeenCalledTimes(2);
    expect(iterations).toMatchSnapshot();
  });

  test('streams - boards, use full_refresh sync mode', async () => {
    const fnBoardsFunc = jest.fn();

    AzureWorkitems.instance = jest.fn().mockImplementation(() => {
      const boardsResource: any[] = readTestResourceFile('boards.json');
      return new AzureWorkitems(
        null,
        null,
        {
          get: fnBoardsFunc.mockResolvedValue({
            data: {value: boardsResource},
          }),
        } as any,
        null,
        new Map(),
        logger
      );
    });
    const source = new sut.AzureWorkitemsSource(logger);
    const streams = source.streams({} as any);

    const boardsStream = streams[3];
    const boardIter = boardsStream.readRecords(SyncMode.FULL_REFRESH);
    const boards = [];
    for await (const board of boardIter) {
      boards.push(board);
    }

    expect(fnBoardsFunc).toHaveBeenCalledTimes(1);
    expect(boards).toStrictEqual(readTestResourceFile('boards.json'));
  });

  test('streams - workitems, use full_refresh sync mode', async () => {
    const getFunc = jest.fn().mockImplementation((url) => {
      if (url.includes('states')) {
        return {data: readTestResourceFile('workitem_states.json')};
      } else if (url.includes('updates')) {
        return {data: readTestResourceFile('workitem_updates.json')};
      } else if (url.includes('workitems?ids')) {
        return {data: readTestResourceFile('workitems.json')};
      }
      return {};
    });
    const workitemIdsFunc = jest.fn();

    const fieldReferences = new Map([
      ['System.AreaPath', 'Area Path'],
      ['Microsoft.VSTS.Scheduling.Effort', 'Effort'],
      ['Microsoft.VSTS.Scheduling.RemainingWork', 'Remaining Work'],
      ['Custom.TestName', 'Test Name'],
    ]);
    AzureWorkitems.instance = jest.fn().mockImplementation(() => {
      return new AzureWorkitems(
        null,
        null,
        {
          get: getFunc,
          post: workitemIdsFunc
            .mockResolvedValueOnce({
              data: readTestResourceFile('workitem_ids.json'),
            })
            .mockResolvedValue({data: {}}),
        } as any,
        null,
        fieldReferences,
        logger
      );
    });
    const source = new sut.AzureWorkitemsSource(logger);
    const streams = source.streams({} as any);

    const workitemsStream = streams[0];
    const workitemsIter = workitemsStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      {name: 'test', id: '123'}
    );
    const workitems = [];
    for await (const workitem of workitemsIter) {
      workitems.push(workitem);
    }

    expect(getFunc).toHaveBeenCalledTimes(15);
    expect(workitemIdsFunc).toHaveBeenCalledTimes(11);
    expect(workitems).toMatchSnapshot();
  });
});
