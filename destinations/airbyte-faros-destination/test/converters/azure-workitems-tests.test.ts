import {Workitems} from '../../src/converters/azure-workitems/workitems';
import {StreamContext} from '../../src/converters/converter';

const createBaseWorkItemData = () => ({
  project: {
    id: 'fabrikam-fiber-git',
    name: 'Fabrikam-Fiber-Git',
  },
  revisions: {
    states: [],
    iterations: [],
    assignees: [],
  },
});

const createTestRelation = (rel: string, workItemId: number) => ({
  rel,
  url: `https://dev.azure.com/fabrikam/_apis/wit/workItems/${workItemId}`,
  attributes: {
    isLocked: false,
  },
});

const createWorkItemRecord = (id: number, workItemType: string, title: string, description: string, state: string, createdDate: string, relations: any[] = []) => ({
  record: {
    stream: 'workitems',
    emitted_at: Date.now(),
    data: {
      id,
      rev: 1,
      ...createBaseWorkItemData(),
      fields: {
        'System.WorkItemType': workItemType,
        'System.Title': title,
        'System.Description': description,
        'System.State': state,
        'System.CreatedDate': createdDate,
        'Faros': {
          'WorkItemStateCategory': 'Proposed',
        },
      },
      relations,
    },
  },
  type: 'record' as any,
});

const findResultByModel = (result: readonly any[], model: string) => 
  result.find(r => r.model === model);

const expectTestCaseResult = (result: readonly any[], uid: string, name: string, description: string) => {
  const testCase = findResultByModel(result, 'qa_TestCase');
  expect(testCase).toBeDefined();
  expect(testCase?.record).toMatchObject({
    uid,
    name,
    description,
    source: 'Azure-Workitems',
    type: {category: 'Manual', detail: 'manual'},
  });
};

const expectTestAssociation = (result: readonly any[], testCaseUid: string, workItemUid: string) => {
  const association = findResultByModel(result, 'qa_TestCaseWorkItemAssociation');
  expect(association).toBeDefined();
  expect(association?.record).toMatchObject({
    testCase: {uid: testCaseUid, source: 'Azure-Workitems'},
    workItem: {uid: workItemUid, source: 'Azure-Workitems'},
  });
};

const expectNoTestAssociations = (result: readonly any[]) => {
  const associations = result.filter(r => r.model === 'qa_TestCaseWorkItemAssociation');
  expect(associations).toHaveLength(0);
};

describe('azure-workitems tests relationships', () => {
  const converter = new Workitems();
  const ctx: StreamContext = {
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any,
    farosClient: {} as any,
    graph: {} as any,
    resetModelsByStream: {} as any,
    streamsByResetModel: {} as any,
    resetModels: new Set(),
    skipResetModels: new Set(),
    streamName: {source: 'Azure-Workitems', name: 'workitems'},
    config: {edition_configs: {}} as any,
    origin: 'test',
    originLocation: 'test',
    originLocationName: 'test',
    originLocationDisplayName: 'test',
    originLocationUrl: 'test',
    originLocationIcon: 'test',
    originLocationDescription: 'test',
    originLocationTags: [],
    originLocationMetadata: {},
    originLocationCreatedAt: new Date(),
    originLocationUpdatedAt: new Date(),
  } as any;

  test('should convert test case with tests relationship', async () => {
    const record = createWorkItemRecord(
      301,
      'Test Case',
      'Test Microsoft Account Authentication',
      'Verify that users can successfully authenticate using Microsoft Account credentials',
      'Design',
      '2014-12-29T20:49:23.103Z',
      [createTestRelation('Microsoft.VSTS.Common.TestedBy-Forward', 297)]
    );

    const result = await converter.convert(record as any, ctx);

    expect(result).toHaveLength(2);
    expectTestCaseResult(result, '301', 'Test Microsoft Account Authentication', 'Verify that users can successfully authenticate using Microsoft Account credentials');
    expectTestAssociation(result, '301', '297');
  });

  test('should convert work item with tested by relationship', async () => {
    const record = createWorkItemRecord(
      297,
      'Product Backlog Item',
      'Customer can sign in using their Microsoft Account',
      'Our authorization logic needs to allow for users with Microsoft accounts',
      'New',
      '2014-12-29T20:49:20.77Z',
      [createTestRelation('Microsoft.VSTS.Common.TestedBy-Reverse', 301)]
    );

    const result = await converter.convert(record as any, ctx);
    expectTestAssociation(result, '301', '297');
  });

  test('should handle work item without test relationships', async () => {
    const record = createWorkItemRecord(
      299,
      'Task',
      'JavaScript implementation for Microsoft Account',
      'Task description',
      'To Do',
      '2014-12-29T20:49:21.617Z',
      []
    );

    const result = await converter.convert(record as any, ctx);
    expectNoTestAssociations(result);
  });
});
