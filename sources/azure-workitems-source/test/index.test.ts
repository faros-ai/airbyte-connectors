import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import {AzureDevOpsClient} from 'faros-airbyte-common/azure-devops';
import {
  readResourceAsJSON,
  readTestFileAsJSON,
  sourceCheckTest,
} from 'faros-airbyte-testing-tools';

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
  const instanceType = 'cloud';

  const source = new sut.AzureWorkitemsSource(logger);

  beforeEach(() => {
    AzureWorkitems.instance = azureWorkitem;
  });

  test('spec', async () => {
    const source = new sut.AzureWorkitemsSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceAsJSON('spec.json'))
    );
  });

  test('check connection - valid config', async () => {
    AzureWorkitems.instance = jest.fn().mockImplementation(() => {
      const projectsResource: any[] = readTestFileAsJSON('projects.json');
      return new AzureWorkitems(
        {
          core: {
            getProject: jest.fn().mockResolvedValue({
              data: {value: projectsResource},
            }),
          },
        } as unknown as AzureDevOpsClient,
        instanceType,
        null,
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

  test('streams - iterations, use full_refresh sync mode', async () => {
    AzureWorkitems.instance = jest.fn().mockImplementation(() => {
      return new AzureWorkitems(
        {
          wit: {
            getClassificationNode: jest
              .fn()
              .mockResolvedValue(readTestFileAsJSON('iterations_root.json')),
            getClassificationNodes: jest
              .fn()
              .mockResolvedValueOnce([
                readTestFileAsJSON('iterations_node_3.json'),
              ]),
          },
        } as unknown as AzureDevOpsClient,
        instanceType,
        null,
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

    const additionalFields = [
      'Area Path',
      'Effort',
      'Remaining Work',
      'Test Name',
    ];

    const fieldReferences = [
      {referenceName: 'System.AreaPath', name: 'Area Path'},
      {referenceName: 'Microsoft.VSTS.Scheduling.Effort', name: 'Effort'},
      {
        referenceName: 'Microsoft.VSTS.Scheduling.RemainingWork',
        name: 'Remaining Work',
      },
      {referenceName: 'Custom.TestName', name: 'Test Name'},
    ];

    AzureWorkitems.instance = jest.fn().mockImplementation(() => {
      return new AzureWorkitems(
        {
          wit: {
            getFields: jest.fn().mockResolvedValue(fieldReferences),
            getWorkItems: jest
              .fn()
              .mockResolvedValue(readTestFileAsJSON('workitems.json').value),
            getWorkItemTypeStates: jest
              .fn()
              .mockResolvedValue(
                readTestFileAsJSON('workitem_states.json').value
              ),
            getUpdates: jest
              .fn()
              .mockResolvedValue(
                readTestFileAsJSON('workitem_updates.json').value
              ),
            getComments: jest
              .fn()
              .mockResolvedValue(readTestFileAsJSON('comments.json')),
            queryByWiql: workitemIdsFunc
              // First call: epic query
              .mockResolvedValueOnce({workItems: [{id: 100}, {id: 101}]})
              // Next calls: descendant queries for each epic
              .mockResolvedValueOnce({
                workItemRelations: [{target: {id: 297}}, {target: {id: 299}}],
              })
              .mockResolvedValueOnce({workItemRelations: [{target: {id: 300}}]})
              // Remaining calls: workitem queries
              .mockResolvedValue(readTestFileAsJSON('workitem_ids.json')),
          },
        } as unknown as AzureDevOpsClient,
        instanceType,
        90,
        100,
        logger,
        additionalFields,
        true
      );
    });
    const source = new sut.AzureWorkitemsSource(logger);
    const streams = source.streams({} as any);

    const workitemsStream = streams[1];
    const workitemsIter = workitemsStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      {name: 'test', id: '123'},
      {
        '123': {
          cutoff: new Date('2021-01-01').getTime(),
        },
      }
    );
    const workitems = [];
    for await (const workitem of workitemsIter) {
      workitems.push(workitem);
    }

    expect(workitemIdsFunc).toHaveBeenCalledTimes(13); // 1 epic query + 2 descendant queries + 10 non-epic workitem queries
    expect(workitems).toMatchSnapshot();
  });

  test('streams - workitems, use incremental sync mode', async () => {
    const dateT = new Date('2025-04-01').getTime();
    const workitemIdsFunc = jest.fn();

    const additionalFields = [
      'Area Path',
      'Effort',
      'Remaining Work',
      'Test Name',
    ];

    const fieldReferences = [
      {referenceName: 'System.AreaPath', name: 'Area Path'},
      {referenceName: 'Microsoft.VSTS.Scheduling.Effort', name: 'Effort'},
      {
        referenceName: 'Microsoft.VSTS.Scheduling.RemainingWork',
        name: 'Remaining Work',
      },
      {referenceName: 'Custom.TestName', name: 'Test Name'},
    ];

    AzureWorkitems.instance = jest.fn().mockImplementation(() => {
      return new AzureWorkitems(
        {
          wit: {
            getFields: jest.fn().mockResolvedValue(fieldReferences),
            getWorkItems: jest
              .fn()
              .mockResolvedValue(readTestFileAsJSON('workitems.json').value),
            getWorkItemTypeStates: jest
              .fn()
              .mockResolvedValue(
                readTestFileAsJSON('workitem_states.json').value
              ),
            getUpdates: jest
              .fn()
              .mockResolvedValue(
                readTestFileAsJSON('workitem_updates.json').value
              ),
            queryByWiql: workitemIdsFunc
              // First call: epic query
              .mockResolvedValueOnce({workItems: [{id: 100}, {id: 101}]})
              // Next calls: descendant queries for each epic
              .mockResolvedValueOnce({
                workItemRelations: [{target: {id: 297}}, {target: {id: 299}}],
              })
              .mockResolvedValueOnce({workItemRelations: [{target: {id: 300}}]})
              // Remaining calls: workitem queries
              .mockResolvedValue(readTestFileAsJSON('workitem_ids.json')),
          },
        } as unknown as AzureDevOpsClient,
        instanceType,
        null,
        100,
        logger,
        additionalFields,
        false
      );
    });
    const source = new sut.AzureWorkitemsSource(logger);
    const streams = source.streams({} as any);

    const workitemsStream = streams[1];
    const workitemsIter = workitemsStream.readRecords(
      SyncMode.INCREMENTAL,
      undefined,
      {name: 'test', id: '123'},
      {
        test: {
          cutoff: dateT,
        },
      }
    );
    const workitems = [];
    for await (const workitem of workitemsIter) {
      workitems.push(workitem);
    }

    expect(workitemIdsFunc).toHaveBeenCalledTimes(13); // 1 epic query + 2 descendant queries + 10 non-epic workitem queries
    const call = workitemIdsFunc.mock.calls[3][0];
    expect(call.query).toMatch(
      `[System.ChangedDate] >= '2025-04-01T00:00:00.000Z'`
    );
  });
});
