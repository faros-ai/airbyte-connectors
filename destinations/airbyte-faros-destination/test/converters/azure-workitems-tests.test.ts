import {Workitems} from '../../src/converters/azure-workitems/workitems';
import {StreamContext} from '../../src/converters/converter';

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
    const record = {
      record: {
        stream: 'workitems',
        emitted_at: Date.now(),
        data: {
          id: 301,
          rev: 1,
          project: {
            id: 'fabrikam-fiber-git',
            name: 'Fabrikam-Fiber-Git',
          },
          fields: {
            'System.WorkItemType': 'Test Case',
            'System.Title': 'Test Microsoft Account Authentication',
            'System.Description': 'Verify that users can successfully authenticate using Microsoft Account credentials',
            'System.State': 'Design',
            'System.CreatedDate': '2014-12-29T20:49:23.103Z',
            'Faros': {
              'WorkItemStateCategory': 'Proposed',
            },
          },
          revisions: {
            states: [],
            iterations: [],
            assignees: [],
          },
          relations: [
            {
              rel: 'Microsoft.VSTS.Common.TestedBy-Forward',
              url: 'https://dev.azure.com/fabrikam/_apis/wit/workItems/297',
              attributes: {
                isLocked: false,
              },
            },
          ],
        },
      },
      type: 'record' as any,
    };

    const result = await converter.convert(record as any, ctx);

    expect(result).toHaveLength(2);
    
    const testCase = result.find(r => r.model === 'qa_TestCase');
    expect(testCase).toBeDefined();
    expect(testCase?.record).toMatchObject({
      uid: '301',
      name: 'Test Microsoft Account Authentication',
      description: 'Verify that users can successfully authenticate using Microsoft Account credentials',
      source: 'Azure-Workitems',
      type: {category: 'Manual', detail: 'manual'},
    });

    const association = result.find(r => r.model === 'qa_TestCaseWorkItemAssociation');
    expect(association).toBeDefined();
    expect(association?.record).toMatchObject({
      testCase: {uid: '301', source: 'Azure-Workitems'},
      workItem: {uid: '297', source: 'Azure-Workitems'},
    });
  });

  test('should convert work item with tested by relationship', async () => {
    const record = {
      record: {
        stream: 'workitems',
        emitted_at: Date.now(),
        data: {
          id: 297,
          rev: 1,
          project: {
            id: 'fabrikam-fiber-git',
            name: 'Fabrikam-Fiber-Git',
          },
          fields: {
            'System.WorkItemType': 'Product Backlog Item',
            'System.Title': 'Customer can sign in using their Microsoft Account',
            'System.Description': 'Our authorization logic needs to allow for users with Microsoft accounts',
            'System.State': 'New',
            'System.CreatedDate': '2014-12-29T20:49:20.77Z',
            'Faros': {
              'WorkItemStateCategory': 'Proposed',
            },
          },
          revisions: {
            states: [],
            iterations: [],
            assignees: [],
          },
          relations: [
            {
              rel: 'Microsoft.VSTS.Common.TestedBy-Reverse',
              url: 'https://dev.azure.com/fabrikam/_apis/wit/workItems/301',
              attributes: {
                isLocked: false,
              },
            },
          ],
        },
      },
      type: 'record' as any,
    };

    const result = await converter.convert(record as any, ctx);

    const association = result.find(r => r.model === 'qa_TestCaseWorkItemAssociation');
    expect(association).toBeDefined();
    expect(association?.record).toMatchObject({
      testCase: {uid: '301', source: 'Azure-Workitems'},
      workItem: {uid: '297', source: 'Azure-Workitems'},
    });
  });

  test('should handle work item without test relationships', async () => {
    const record = {
      record: {
        stream: 'workitems',
        emitted_at: Date.now(),
        data: {
          id: 299,
          rev: 7,
          project: {
            id: 'fabrikam-fiber-git',
            name: 'Fabrikam-Fiber-Git',
          },
          fields: {
            'System.WorkItemType': 'Task',
            'System.Title': 'JavaScript implementation for Microsoft Account',
            'System.State': 'To Do',
            'System.CreatedDate': '2014-12-29T20:49:21.617Z',
            'Faros': {
              'WorkItemStateCategory': 'Proposed',
            },
          },
          revisions: {
            states: [],
            iterations: [],
            assignees: [],
          },
          relations: [],
        },
      },
      type: 'record' as any,
    };

    const result = await converter.convert(record as any, ctx);

    const associations = result.filter(r => r.model === 'qa_TestCaseWorkItemAssociation');
    expect(associations).toHaveLength(0);
  });
});
