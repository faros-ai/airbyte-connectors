import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import {FarosClient} from 'faros-js-client';
import fs from 'fs-extra';
import {Dictionary} from 'ts-essentials';
import VError from 'verror';

import {FarosIssuePullRequests} from '../lib/streams/faros_issue_pull_requests';
import * as sut from '../src/index';
import {Jira, JiraConfig} from '../src/jira';
import {RunMode} from '../src/streams/common';

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

  const source = new sut.JiraSource(logger);
  const config = readTestResourceFile('config.json');

  test('spec', async () => {
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection - missing url', async () => {
    const source = new sut.JiraSource(logger);
    const configs = [{}, {url: undefined}, {url: null}, {url: ''}];

    for (const config of configs) {
      await expect(
        source.checkConnection(config as any)
      ).resolves.toStrictEqual([
        false,
        new VError('Please provide a Jira URL'),
      ]);
    }
  });

  test('check connection - missing credentials ', async () => {
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

  test('check connection - invalid bucketing config - out of range', async () => {
    const source = new sut.JiraSource(logger);
    const bucketTotal = 2;
    await expect(
      source.checkConnection({
        ...config,
        bucket_id: 3,
        bucket_total: bucketTotal,
      })
    ).resolves.toStrictEqual([
      false,
      new VError(`bucket_id must be between 1 and ${bucketTotal}`),
    ]);
  });

  test('check connection - invalid bucketing config - non positive integer', async () => {
    const source = new sut.JiraSource(logger);
    await expect(
      source.checkConnection({...config, bucket_id: 1, bucket_total: -1})
    ).resolves.toStrictEqual([
      false,
      new VError(`bucket_total must be a positive integer`),
    ]);
  });

  test('check connection', async () => {
    const source = new sut.JiraSource(logger);
    await expect(
      source.checkConnection(readTestResourceFile('config.json'))
    ).resolves.toStrictEqual([true, undefined]);
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
    sourceConfig: JiraConfig,
    mockedImplementation?: any,
    streamSlice?: any,
    isCloud = true,
    // only use if we do not want to write data snapshot
    expectedResultLength?: number
  ) => {
    Jira.instance = jest.fn().mockImplementation(() => {
      return new Jira(
        'https://jira.com',
        mockedImplementation ?? ({} as any),
        {} as any,
        new Map([['field_001', 'Development']]),
        50,
        new Map(),
        isCloud,
        5,
        100,
        sourceConfig.bucket_id,
        sourceConfig.bucket_total,
        logger,
        undefined,
        sourceConfig?.requestedStreams,
        sourceConfig?.use_sprints_reverse_search
      );
    });
    const source = new sut.JiraSource(logger);
    const streams = source.streams(sourceConfig);
    const stream = streams[streamIndex];
    const iter = stream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      streamSlice,
      {}
    );

    const items = [];
    for await (const item of iter) {
      items.push(item);
    }
    if (!expectedResultLength) {
      expect(items).toMatchSnapshot();
    } else {
      expect(items).toHaveLength(expectedResultLength);
    }
  };

  const getIssuePullRequestsMockedImplementation = () => ({
    v2: {
      issueSearch: {
        searchForIssuesUsingJql: paginate(
          readTestResourceFile('issues_with_pull_requests.json'),
          'issues'
        ),
      },
    },
    getDevStatusSummary: jest
      .fn()
      .mockResolvedValue(readTestResourceFile('dev_status_summary.json')),
    getDevStatusDetail: jest
      .fn()
      .mockResolvedValue(readTestResourceFile('dev_status_detail.json')),
  });

  const getSprintReportsMockedImplementation = () => ({
    agile: {
      board: {
        getBoard: jest
          .fn()
          .mockResolvedValue(readTestResourceFile('board.json')),
        getAllSprints: paginate(readTestResourceFile('sprints.json')),
      },
    },
    getSprintReport: jest
      .fn()
      .mockResolvedValue(readTestResourceFile('sprint_report.json')),
  });

  test('streams - json schema fields', async () => {
    const source = new sut.JiraSource(logger);
    const streams = source.streams(config);

    const validateFieldInSchema = (
      field: string | string[],
      schema: Dictionary<any>
    ) => {
      if (Array.isArray(field)) {
        let nestedField = schema;
        for (const subField of field) {
          expect(nestedField).toHaveProperty(subField);
          nestedField = nestedField[subField].properties;
        }
      } else {
        expect(schema).toHaveProperty(field);
      }
    };

    for (const stream of streams) {
      const jsonSchema = stream.getJsonSchema().properties;
      const primaryKey = stream.primaryKey;
      const cursorField = stream.cursorField;

      // Validate primaryKey is in jsonSchema
      if (primaryKey) {
        if (Array.isArray(primaryKey)) {
          for (const key of primaryKey) {
            validateFieldInSchema(key, jsonSchema);
          }
        } else {
          validateFieldInSchema(primaryKey, jsonSchema);
        }
      }

      // Validate cursorField is in jsonSchema
      validateFieldInSchema(cursorField, jsonSchema);
    }
  });

  test('streams - issue_pull_requests', async () => {
    await testStream(
      0,
      {
        ...config,
        requestedStreams: new Set(['faros_issue_pull_requests']),
        start_date: new Date('2021-01-01'),
        end_date: new Date('2021-01-02'),
      },
      getIssuePullRequestsMockedImplementation(),
      {project: 'TEST'}
    );
  });

  test('streams - sprint_reports', async () => {
    await testStream(1, config, getSprintReportsMockedImplementation(), {
      board: '1',
    });
  });

  test('streams - sprint_reports with run mode WebhookSupplement using Faros client', async () => {
    const gqlMock = jest.spyOn(FarosClient.prototype, 'gql');
    gqlMock.mockReturnValueOnce(
      Promise.resolve({
        tms_SprintBoardRelationship: [
          {
            sprint: {
              uid: '1',
              name: 'Sprint 1',
              state: 'closed',
              closedAt: '2024-01-01T00:00:00Z',
            },
          },
        ],
      })
    );
    gqlMock.mockReturnValueOnce(
      Promise.resolve({tms_SprintBoardRelationship: []})
    );
    const reportsConfig = {
      ...config,
      run_mode: RunMode.WebhookSupplement,
      api_key: 'SECRET',
      api_url: 'https://dev.api.faros.ai',
      graph: 'test',
    };
    await testStream(1, reportsConfig, getSprintReportsMockedImplementation(), {
      board: '1',
    });
  });

  test('streams - board_issues using board ids', async () => {
    await testStream(
      2,
      readTestResourceFile('config.json'),
      {
        agile: {
          board: {
            getConfiguration: jest
              .fn()
              .mockResolvedValue(
                readTestResourceFile('board_configuration.json')
              ),
          },
        },
        v2: {
          filters: {
            getFilter: jest
              .fn()
              .mockResolvedValue(readTestResourceFile('board_filter.json')),
          },
          issueSearch: {
            searchForIssuesUsingJql: paginate(
              readTestResourceFile('issues_from_board.json'),
              'issues'
            ),
          },
        },
      },
      {board: '1'}
    );
  });

  test('streams - sprints', async () => {
    await testStream(
      3,
      config,
      {
        agile: {
          board: {
            getBoard: jest
              .fn()
              .mockResolvedValue(readTestResourceFile('board.json')),
            getAllSprints: paginate(readTestResourceFile('sprints.json')),
          },
        },
      },
      {board: '1'}
    );
  });

  test('streams - sprints using most recent', async () => {
    const sprint = readTestResourceFile('sprints.json')[0];
    const getAllSprintsfn = jest
      .fn()
      .mockResolvedValueOnce({total: 1, values: [sprint]})
      .mockResolvedValueOnce({
        total: 57,
        values: Array(57).fill(sprint),
      })
      .mockResolvedValueOnce({
        total: 57,
        values: Array(50).fill(sprint),
      })
      .mockResolvedValueOnce({
        total: 57,
        values: Array(7).fill(sprint),
      });

    await testStream(
      3,
      {...config, use_sprints_reverse_search: true},
      {
        agile: {
          board: {
            getBoard: jest
              .fn()
              .mockResolvedValue(readTestResourceFile('board.json')),
            getAllSprints: getAllSprintsfn,
          },
        },
      },
      {board: '1'},
      true,
      58
    );

    expect(getAllSprintsfn).toHaveBeenCalledTimes(4);
    expect(getAllSprintsfn).toHaveBeenNthCalledWith(1, {
      boardId: 1,
      startAt: 0,
      state: 'active,future',
      maxResults: 100,
    });
    expect(getAllSprintsfn).toHaveBeenNthCalledWith(2, {
      boardId: 1,
      state: 'closed',
      maxResults: 50,
    });
    expect(getAllSprintsfn).toHaveBeenNthCalledWith(3, {
      boardId: 1,
      startAt: 7,
      state: 'closed',
      maxResults: 50,
    });
    expect(getAllSprintsfn).toHaveBeenNthCalledWith(4, {
      boardId: 1,
      startAt: 0,
      state: 'closed',
      maxResults: 7,
    });
  });

  test('streams - users', async () => {
    await testStream(4, readTestResourceFile('config.json'), {
      v2: {
        users: {
          getAllUsersDefault: paginate(readTestResourceFile('users.json')),
        },
      },
    });
  });

  test('streams - projects - pull all projects', async () => {
    const searchProjects = paginate(
      readTestResourceFile('projects.json'),
      'values',
      50
    );
    await testStream(
      5,
      {...readTestResourceFile('config.json'), projects: undefined},
      {v2: {projects: {searchProjects}}}
    );
    expect(searchProjects).toHaveBeenCalledWith({
      action: 'browse',
      expand: 'description',
      maxResults: 100,
      startAt: 0,
    });
  });

  test('streams - projects - Cloud project list', async () => {
    const keys = ['TEST-1', 'TEST-2', 'TEST-3', 'TEST-4'];
    const searchProjects = paginate(
      readTestResourceFile('projects.json'),
      'values',
      50
    );
    await testStream(
      5,
      {...readTestResourceFile('config.json'), projects: keys},
      {v2: {projects: {searchProjects}}}
    );
    expect(searchProjects).toHaveBeenCalledWith({
      action: 'browse',
      expand: 'description',
      keys,
      maxResults: 100,
      startAt: 0,
    });
  });

  test('streams - projects - Jira Server', async () => {
    await testStream(
      5,
      {...readTestResourceFile('config.json'), projects: undefined},
      {
        v2: {
          permissions: {
            getMyPermissions: jest
              .fn()
              .mockResolvedValue(readTestResourceFile('permissions.json')),
          },
        },
        getAllProjects: jest
          .fn()
          .mockResolvedValue(readTestResourceFile('projects.json')),
      },
      undefined,
      false
    );
  });

  test('streams - projects - Jira Server - project list', async () => {
    const serverConfig = readTestResourceFile('config.json');
    serverConfig.projects = ['TEST-1', 'TEST-2'];

    await testStream(
      5,
      serverConfig,
      {
        v2: {
          permissions: {
            getMyPermissions: jest
              .fn()
              .mockResolvedValue(readTestResourceFile('permissions.json')),
          },
        },
        getAllProjects: jest
          .fn()
          .mockResolvedValue(readTestResourceFile('projects.json')),
      },
      undefined,
      false
    );
  });

  test('onBeforeRead with run_mode WebhookSupplement should filter streams', async () => {
    const source = new sut.JiraSource(logger);
    const catalog = readTestResourceFile('catalog.json');
    const {catalog: newCatalog} = await source.onBeforeRead(
      {...config, run_mode: RunMode.WebhookSupplement},
      catalog
    );
    expect(newCatalog).toMatchSnapshot();
  });

  test('onBeforeRead with run_mode Full should not filter streams', async () => {
    const source = new sut.JiraSource(logger);
    const catalog = readTestResourceFile('catalog.json');
    const {catalog: newCatalog} = await source.onBeforeRead(
      {...config, run_mode: RunMode.Full},
      catalog
    );
    expect(newCatalog).toMatchSnapshot();
  });

  async function testStreamSlices(config: JiraConfig): Promise<void> {
    const stream = new FarosIssuePullRequests(config, logger);
    const slices = stream.streamSlices();
    // collect slices in an array and match with snapshot
    const sliceArray = [];
    for await (const slice of slices) {
      sliceArray.push(slice);
    }
    expect(sliceArray).toMatchSnapshot();
  }

  test('stream with project slices using bucket 1', async () => {
    // test with bucket_id 1
    await testStreamSlices({
      ...config,
      bucket_total: 2,
      bucket_id: 1,
      projects: ['TEST', 'TEST2', 'TEST3'],
    });
  });

  test('stream with project slices using bucket 2', async () => {
    // test with bucket_id 2
    await testStreamSlices({
      ...config,
      bucket_total: 2,
      bucket_id: 2,
      projects: ['TEST', 'TEST2', 'TEST3'],
    });
  });

  test('streams - boards', async () => {
    await testStream(
      7,
      config,
      {
        agile: {
          board: {
            getAllBoards: paginate(readTestResourceFile('boards.json')),
          },
        },
      },
      {project: 'TEST'}
    );
  });

  test('streams - project versions', async () => {
    await testStream(
      8,
      config,
      {
        v2: {
          projectVersions: {
            getProjectVersionsPaginated: paginate(
              readTestResourceFile('project_versions.json')
            ),
          },
        },
      },
      {project: 'TEST'}
    );
  });

  test('streams - project version issues', async () => {
    const version = readTestResourceFile('project_versions.json')[0];
    await testStream(9, config, {
      v2: {
        issueSearch: {
          searchForIssuesUsingJql: paginate(
            readTestResourceFile('project_version_issues.json'),
            'issues'
          ),
        },
        projectVersions: {
          getProjectVersionsPaginated: paginate([version]),
        },
      },
    });
  });

  test('streams - teams', async () => {
    await testStream(
      10,
      {
        ...config,
        fetch_teams: true,
        organization_id: 'aaaa22211-1234-aaaa-bb22-123122dds',
      },
      {
        graphql: jest
          .fn()
          .mockResolvedValue(readTestResourceFile('teams.json')),
      }
    );
  });

  test('streams - team memberships', async () => {
    await testStream(
      11,
      {
        ...config,
        fetch_team_memberships: true,
        organization_id: 'aaaa22211-1234-aaaa-bb22-123122dds',
      },
      {
        graphql: jest
          .fn()
          .mockResolvedValue(readTestResourceFile('teams.json')),
        getTeamMemberships: jest
          .fn()
          .mockResolvedValue(readTestResourceFile('team_memberships.json')),
      }
    );
  });
});
