import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  sourceCheckTest,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';

import {AzureWorkitems, AzureWorkitemsClient} from '../src/azure-workitems';
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
      const projectsResource: any[] = readTestResourceFile('projects.json');
      return new AzureWorkitems(
        {
          core: {
            getProject: jest.fn().mockResolvedValue({
              data: {value: projectsResource},
            }),
          },
        } as unknown as AzureWorkitemsClient,
        null,
        new Map(),
        null,
        logger
      );
    });

    const config = {
      access_token: 'access_token',
      organization: 'organization',
      projects: ['project'],
    };

    // Valid cloud config
    await sourceCheckTest({
      source,
      configOrPath: config,
    });

    // Valid server config
    await sourceCheckTest({
      source,
      configOrPath: {
        ...config,
        instance: {type: 'server', api_url: 'https://azure.myorg.com'},
      },
    });
  });

  test('check connection - no access token', async () => {
    await sourceCheckTest({
      source,
      configOrPath: {
        access_token: '',
        organization: 'organization',
        projects: ['project'],
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

  test('check connection - api_url not provided for server instance', async () => {
    await sourceCheckTest({
      source,
      configOrPath: {
        instance: {
          type: 'server',
          api_url: '',
        },
        access_token: 'access_token',
        organization: 'organization',
        project: 'project',
      },
    });
  });

  test('check connection - invalid server api_url', async () => {
    await sourceCheckTest({
      source,
      configOrPath: {
        instance: {
          type: 'server',
          api_url: 'invalid_url',
        },
        access_token: 'access_token',
        organization: 'organization',
        project: 'project',
      },
    });
  });

  test('streams - users (cloud), use full_refresh sync mode', async () => {
    const fnUsersFunc = jest.fn();

    AzureWorkitems.instance = jest.fn().mockImplementation(() => {
      const usersResource: any[] = readTestResourceFile('users.json');
      return new AzureWorkitems(
        {
          graph: {
            get: fnUsersFunc.mockResolvedValue({
              data: {value: usersResource},
            }),
          },
        } as unknown as AzureWorkitemsClient,
        {type: 'cloud'},
        new Map(),
        null,
        logger
      );
    });
    const source = new sut.AzureWorkitemsSource(logger);
    const streams = source.streams({} as any);

    const usersStream = streams[2];
    const userIter = usersStream.readRecords(SyncMode.FULL_REFRESH);
    const users = [];
    for await (const user of userIter) {
      users.push(user);
    }

    expect(fnUsersFunc).toHaveBeenCalledTimes(1);
    expect(users).toStrictEqual(readTestResourceFile('users.json'));
  });

  test('streams - users (server), use full_refresh sync mode', async () => {
    AzureWorkitems.instance = jest.fn().mockImplementation(() => {
      return new AzureWorkitems(
        {
          core: {
            getProject: jest.fn().mockResolvedValue({
              id: 'eb6e4656-77fc-42a1-9181-4c6d8e9da5d1',
            }),
            getTeams: jest
              .fn()
              .mockResolvedValueOnce(readTestResourceFile('teams.json').value),
            getTeamMembersWithExtendedProperties: jest
              .fn()
              .mockResolvedValue(
                readTestResourceFile('team_members.json').value
              ),
          },
        } as unknown as AzureWorkitemsClient,
        {type: 'server', api_url: 'https://azure.myorg.com'},
        new Map(),
        100,
        logger
      );
    });
    const source = new sut.AzureWorkitemsSource(logger);
    const streams = source.streams({projects: ['project']} as any);

    const usersStream = streams[2];
    const userIter = usersStream.readRecords(SyncMode.FULL_REFRESH);
    const users = [];
    for await (const user of userIter) {
      users.push(user);
    }
    expect(users).toMatchSnapshot();
  });

  test('streams - iterations, use full_refresh sync mode', async () => {
    AzureWorkitems.instance = jest.fn().mockImplementation(() => {
      return new AzureWorkitems(
        {
          wit: {
            getClassificationNode: jest
              .fn()
              .mockResolvedValue(readTestResourceFile('iterations_root.json')),
            getClassificationNodes: jest
              .fn()
              .mockResolvedValueOnce([
                readTestResourceFile('iterations_node_3.json'),
              ]),
          },
        } as unknown as AzureWorkitemsClient,
        null,
        new Map(),
        100,
        logger
      );
    });
    const source = new sut.AzureWorkitemsSource(logger);
    const streams = source.streams({} as any);

    const iterationsStream = streams[3];
    const iterationsIter = iterationsStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      {name: 'test', id: '123'}
    );
    const iterations = [];
    for await (const iteration of iterationsIter) {
      iterations.push(iteration);
    }

    expect(iterations).toMatchSnapshot();
  });

  test('streams - workitems, use full_refresh sync mode', async () => {
    const workitemIdsFunc = jest.fn();

    const fieldReferences = new Map([
      ['System.AreaPath', 'Area Path'],
      ['Microsoft.VSTS.Scheduling.Effort', 'Effort'],
      ['Microsoft.VSTS.Scheduling.RemainingWork', 'Remaining Work'],
      ['Custom.TestName', 'Test Name'],
    ]);

    AzureWorkitems.instance = jest.fn().mockImplementation(() => {
      return new AzureWorkitems(
        {
          wit: {
            getWorkItems: jest
              .fn()
              .mockResolvedValue(readTestResourceFile('workitems.json').value),
            getWorkItemTypeStates: jest
              .fn()
              .mockResolvedValue(
                readTestResourceFile('workitem_states.json').value
              ),
            getUpdates: jest
              .fn()
              .mockResolvedValue(
                readTestResourceFile('workitem_updates.json').value
              ),
            queryByWiql: workitemIdsFunc.mockResolvedValue(
              readTestResourceFile('workitem_ids.json')
            ),
          },
        } as unknown as AzureWorkitemsClient,
        null,
        fieldReferences,
        100,
        logger
      );
    });
    const source = new sut.AzureWorkitemsSource(logger);
    const streams = source.streams({} as any);

    const workitemsStream = streams[1];
    const workitemsIter = workitemsStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      {name: 'test', id: '123'}
    );
    const workitems = [];
    for await (const workitem of workitemsIter) {
      workitems.push(workitem);
    }

    expect(workitemIdsFunc).toHaveBeenCalledTimes(11);
    expect(workitems).toMatchSnapshot();
  });
});
