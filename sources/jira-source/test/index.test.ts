import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import VError from 'verror';

import {JiraConfig} from '../lib/jira';
import * as sut from '../src/index';
import {DEFAULT_CONCURRENCY_LIMIT, DEFAULT_TIMEOUT, Jira} from '../src/jira';
describe('index', () => {
  const logger = new AirbyteLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const source = new sut.JiraSource(logger);

  test('spec', async () => {
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection - invalid', async () => {
    const source = new sut.JiraSource(logger);
    await expect(
      source.checkConnection({url: 'https://jira.com'} as any)
    ).resolves.toStrictEqual([
      false,
      new VError(
        'Either Jira personal token or Jira username and password must be provided'
      ),
    ]);
  });

  const config: JiraConfig = {
    url: 'https://jira.com',
    username: 'user',
    password: 'pass',
    projectKeys: ['TEST'],
    additionalFields: [],
    additionalFieldsArrayLimit: 100,
    concurrencyLimit: DEFAULT_CONCURRENCY_LIMIT,
    maxPageSize: 100,
    maxRetries: 5,
    rejectUnauthorized: true,
    syncAdditionalFields: true,
    timeout: DEFAULT_TIMEOUT,
  };

  test('check connection', async () => {
    const source = new sut.JiraSource(logger);
    await expect(source.checkConnection(config)).resolves.toStrictEqual([
      true,
      undefined,
    ]);
  });

  function paginate<V>(
    items: V[],
    itemsField = 'values',
    pageSize = 1
  ): jest.Mock {
    const fn = jest.fn();
    let count = 0;
    do {
      const slice = items.slice(count, count + pageSize);
      count += slice.length;
      fn.mockResolvedValueOnce({
        isLast: count === items.length,
        [itemsField]: slice,
      });
    } while (count < items.length);
    return fn;
  }

  const testStream = async (
    streamIndex: any,
    expectedData: any,
    streamConfig: JiraConfig,
    mockedImplementation?: any
  ) => {
    Jira.instance = jest.fn().mockImplementation(() => {
      return new Jira(
        'https://jira.com',
        mockedImplementation ?? ({} as any),
        {} as any,
        new Map([['field_001', 'Development']]),
        true,
        5,
        100,
        logger
      );
    });
    const source = new sut.JiraSource(logger);
    const streams = source.streams(streamConfig);
    const stream = streams[streamIndex];
    const iter = stream.readRecords(SyncMode.FULL_REFRESH, undefined, {});

    const items = [];
    for await (const item of iter) {
      items.push(item);
    }
    expect(items).toStrictEqual(expectedData.data);
  };

  test('streams - pull_requests', async () => {
    const issueUpdated = new Date();
    const expectedPullRequests = {
      data: [
        {
          repo: {
            source: 'GitHub',
            org: 'test-org',
            name: 'test-repo',
          },
          number: 123,
          issue: {
            key: 'TEST-1',
            updated: issueUpdated,
            project: 'TEST',
          },
        },
        {
          repo: {
            source: 'GitHub',
            org: 'test-org',
            name: 'test-repo',
          },
          number: 123,
          issue: {
            key: 'TEST-2',
            updated: issueUpdated,
            project: 'TEST',
          },
        },
      ],
    };
    await testStream(0, expectedPullRequests, config, {
      v2: {
        issueSearch: {
          searchForIssuesUsingJql: paginate(
            [
              {
                id: '1',
                key: 'TEST-1',
                fields: {
                  summary: 'summary1',
                  description: 'description1',
                  status: {
                    name: 'status',
                    statusCategory: {
                      name: 'statusCategory',
                    },
                  },
                  updated: issueUpdated,
                  field_001:
                    'PullRequestOverallDetails{openCount=1, mergedCount=1, declinedCount=0}',
                },
              },
              {
                id: '2',
                key: 'TEST-2',
                fields: {
                  summary: 'summary2',
                  description: 'description2',
                  status: {
                    name: 'status',
                    statusCategory: {
                      name: 'statusCategory',
                    },
                  },
                  updated: issueUpdated,
                  field_001:
                    'PullRequestOverallDetails{openCount=1, mergedCount=1, declinedCount=0}',
                },
              },
            ],
            'issues'
          ),
        },
      },
      getDevStatusSummary: jest.fn().mockResolvedValue({
        summary: {
          repository: {
            byInstanceType: {
              Github: {count: 1},
            },
          },
        },
      }),
      getDevStatusDetail: jest.fn().mockResolvedValue({
        detail: [
          {
            branches: [],
            pullRequests: [
              {
                source: {
                  url: 'https://github.com/test-org/test-repo',
                },
                id: '123',
              },
            ],
          },
        ],
      }),
    });
  });

  test('streams - sprint_reports - with projectKeys cfg', async () => {
    const completedAt = new Date('2024-01-01');
    const expectedSprintReports = {
      data: [
        {
          id: 1,
          boardId: '1',
          projectKey: 'TEST',
          completedAt,
          completedPoints: 10,
          completedInAnotherSprintPoints: 5,
          notCompletedPoints: 15,
          puntedPoints: 20,
          plannedPoints: 25,
        },
      ],
    };
    await testStream(1, expectedSprintReports, config, {
      v2: {
        permissions: {
          getMyPermissions: jest.fn().mockResolvedValue({
            permissions: {
              BROWSE_PROJECTS: {
                havePermission: true,
              },
            },
          }),
        },
        projects: {
          getProject: jest.fn().mockResolvedValue({
            id: '1',
            key: 'TEST',
          }),
        },
      },
      agile: {
        board: {
          getAllBoards: paginate([{id: '1', type: 'scrum'}]),
          getAllSprints: paginate([
            {
              id: 1,
              state: 'closed',
              completeDate: '2024-01-01',
            },
          ]),
        },
      },
      getSprintReport: jest.fn().mockResolvedValue({
        contents: {
          completedIssuesInitialEstimateSum: {value: 10},
          completedIssuesEstimateSum: {value: 10},
          issuesNotCompletedInitialEstimateSum: {value: 15},
          issuesNotCompletedEstimateSum: {value: 15},
          puntedIssuesEstimateSum: {value: 20},
          issuesCompletedInAnotherSprintEstimateSum: {value: 5},
          plannedPoints: 25,
        },
      }),
    });
  });
  test('streams - sprint_reports - without projectKeys cfg', async () => {
    const completedAt = new Date('2024-01-01');
    const expectedSprintReports = {
      data: [
        {
          id: 1,
          boardId: '1',
          projectKey: 'TEST',
          completedAt,
          completedPoints: 10,
          completedInAnotherSprintPoints: 5,
          notCompletedPoints: 15,
          puntedPoints: 20,
          plannedPoints: 25,
        },
      ],
    };
    await testStream(
      1,
      expectedSprintReports,
      {
        ...config,
        projectKeys: undefined,
      },
      {
        v2: {
          permissions: {
            getMyPermissions: jest.fn().mockResolvedValue({
              permissions: {
                BROWSE_PROJECTS: {
                  havePermission: true,
                },
              },
            }),
          },
          projects: {
            searchProjects: paginate([
              {
                id: '1',
                key: 'TEST',
              },
            ]),
          },
        },
        agile: {
          board: {
            getAllBoards: paginate([{id: '1', type: 'scrum'}]),
            getAllSprints: paginate([
              {
                id: 1,
                state: 'closed',
                completeDate: '2024-01-01',
              },
            ]),
          },
        },
        getSprintReport: jest.fn().mockResolvedValue({
          contents: {
            completedIssuesInitialEstimateSum: {value: 10},
            completedIssuesEstimateSum: {value: 10},
            issuesNotCompletedInitialEstimateSum: {value: 15},
            issuesNotCompletedEstimateSum: {value: 15},
            puntedIssuesEstimateSum: {value: 20},
            issuesCompletedInAnotherSprintEstimateSum: {value: 5},
            plannedPoints: 25,
          },
        }),
      }
    );
  });
});

function readResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
}
