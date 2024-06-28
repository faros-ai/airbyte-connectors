import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  readTestResourceAsJSON,
  sourceCheckTest,
  sourceReadTest,
} from 'faros-airbyte-cdk';
import {FarosClient} from 'faros-js-client';
import fs from 'fs-extra';
import {Dictionary} from 'ts-essentials';

import {FarosIssuePullRequests} from '../lib/streams/faros_issue_pull_requests';
import * as sut from '../src/index';
import {JiraConfig} from '../src/jira';
import {RunMode} from '../src/streams/common';
import {paginate, setupJiraInstance} from './utils/test-utils';

function readResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
}

describe('index', () => {
  const logger = new AirbyteLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const source = new sut.JiraSource(logger);
  const config = readTestResourceAsJSON('common/config.json');

  test('spec', async () => {
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection - missing url', async () => {
    const configs = [{}, {url: undefined}, {url: null}, {url: ''}];
    for (const config of configs) {
      await sourceCheckTest({
        source,
        configOrPath: config,
      });
    }
  });

  test('check connection - missing credentials ', async () => {
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/missing_credentials.json',
    });
  });

  test('check connection - invalid bucketing config - out of range', async () => {
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/bucket_out_of_range.json',
    });
  });

  test('check connection - invalid bucketing config - non positive integer', async () => {
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/bucket_negative.json',
    });
  });

  test('check connection', async () => {
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/valid.json',
    });
  });

  const getIssuePullRequestsMockedImplementation = () => ({
    v2: {
      issueSearch: {
        searchForIssuesUsingJql: paginate(
          readTestResourceAsJSON(
            'issue_pull_requests/issues_with_pull_requests.json'
          ),
          'issues'
        ),
      },
    },
    getDevStatusSummary: jest
      .fn()
      .mockResolvedValue(
        readTestResourceAsJSON('issue_pull_requests/dev_status_summary.json')
      ),
    getDevStatusDetail: jest
      .fn()
      .mockResolvedValue(
        readTestResourceAsJSON('issue_pull_requests/dev_status_detail.json')
      ),
  });

  const getSprintReportsMockedImplementation = () => ({
    agile: {
      board: {
        getBoard: jest
          .fn()
          .mockResolvedValue(readTestResourceAsJSON('common/board.json')),
        getAllSprints: paginate(readTestResourceAsJSON('sprints/sprints.json')),
        getAllBoards: paginate(
          readTestResourceAsJSON('common/boards_unique.json')
        ),
      },
    },
    getSprintReport: jest
      .fn()
      .mockResolvedValue(
        readTestResourceAsJSON('sprint_reports/sprint_report.json')
      ),
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
    await sourceReadTest({
      source,
      configOrPath: 'issue_pull_requests/config.json',
      catalogOrPath: 'issue_pull_requests/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupJiraInstance(
          getIssuePullRequestsMockedImplementation(),
          true,
          res.config as JiraConfig,
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - sprint_reports', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'sprint_reports/config.json',
      catalogOrPath: 'sprint_reports/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupJiraInstance(
          getSprintReportsMockedImplementation(),
          true,
          res.config as JiraConfig,
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - sprint_reports with run mode WebhookSupplement using Faros client', async () => {
    const gqlMock = jest.spyOn(FarosClient.prototype, 'gql');
    gqlMock.mockReturnValueOnce(
      Promise.resolve(readTestResourceAsJSON('sprint_reports/tms_project.json'))
    );
    gqlMock.mockReturnValueOnce(Promise.resolve({tms_Project: []}));
    gqlMock.mockReturnValueOnce(
      Promise.resolve(
        readTestResourceAsJSON(
          'sprint_reports/tms_sprint_board_relationship.json'
        )
      )
    );
    gqlMock.mockReturnValueOnce(
      Promise.resolve({tms_SprintBoardRelationship: []})
    );
    await sourceReadTest({
      source,
      configOrPath: 'sprint_reports/webhook_config.json',
      catalogOrPath: 'sprint_reports/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupJiraInstance(
          getSprintReportsMockedImplementation(),
          true,
          res.config as JiraConfig,
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - board_issues using board ids', async () => {
    await sourceReadTest({
      source,
      configOrPath: config,
      catalogOrPath: 'board_issues/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupJiraInstance(
          {
            agile: {
              board: {
                getConfiguration: jest
                  .fn()
                  .mockResolvedValue(
                    readTestResourceAsJSON(
                      'board_issues/board_configuration.json'
                    )
                  ),
                getAllBoards: paginate(
                  readTestResourceAsJSON('common/boards_unique.json')
                ),
              },
            },
            v2: {
              filters: {
                getFilter: jest
                  .fn()
                  .mockResolvedValue(
                    readTestResourceAsJSON('board_issues/board_filter.json')
                  ),
              },
              issueSearch: {
                searchForIssuesUsingJql: paginate(
                  readTestResourceAsJSON('board_issues/issues_from_board.json'),
                  'issues'
                ),
              },
            },
          },
          true,
          res.config as JiraConfig,
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - sprints', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'sprints/config.json',
      catalogOrPath: 'sprints/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupJiraInstance(
          {
            agile: {
              board: {
                getBoard: jest
                  .fn()
                  .mockResolvedValue(
                    readTestResourceAsJSON('common/board.json')
                  ),
                getAllSprints: paginate(
                  readTestResourceAsJSON('sprints/sprints.json')
                ),
                getAllBoards: paginate(
                  readTestResourceAsJSON('common/boards_unique.json')
                ),
              },
            },
          },
          true,
          res.config as JiraConfig,
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - sprints using most recent', async () => {
    const sprint = readTestResourceAsJSON('sprints/sprints.json')[0];
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

    const config = readTestResourceAsJSON('sprints/config.json');
    await sourceReadTest({
      source,
      configOrPath: {...config, use_sprints_reverse_search: true},
      catalogOrPath: 'sprints/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupJiraInstance(
          {
            agile: {
              board: {
                getBoard: jest
                  .fn()
                  .mockResolvedValue(
                    readTestResourceAsJSON('common/board.json')
                  ),
                getAllSprints: getAllSprintsfn,
                getAllBoards: paginate(
                  readTestResourceAsJSON('common/boards_unique.json')
                ),
              },
            },
          },
          true,
          res.config as JiraConfig,
          logger
        );
      },
    });

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
    await sourceReadTest({
      source,
      configOrPath: 'users/config.json',
      catalogOrPath: 'users/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupJiraInstance(
          {
            v2: {
              users: {
                getAllUsersDefault: paginate(
                  readTestResourceAsJSON('users/users.json')
                ),
              },
            },
          },
          true,
          res.config as JiraConfig,
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - projects - pull all projects', async () => {
    const searchProjects = paginate(
      readTestResourceAsJSON('projects/projects.json'),
      'values',
      50
    );
    await sourceReadTest({
      source,
      configOrPath: 'projects/config.json',
      catalogOrPath: 'projects/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupJiraInstance(
          {v2: {projects: {searchProjects}}},
          true,
          res.config as JiraConfig,
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
    expect(searchProjects).toHaveBeenCalledWith({
      action: 'browse',
      expand: 'description',
      maxResults: 100,
      startAt: 0,
    });
  });

  test('streams - projects - Cloud project list', async () => {
    const projects = ['TEST-1', 'TEST-2', 'TEST-3', 'TEST-4'];
    const searchProjects = paginate(
      readTestResourceAsJSON('projects/projects.json'),
      'values',
      50
    );
    await sourceReadTest({
      source,
      configOrPath: {
        ...readTestResourceAsJSON('projects/config.json'),
        projects,
      },
      catalogOrPath: 'projects/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupJiraInstance(
          {v2: {projects: {searchProjects}}},
          true,
          res.config as JiraConfig,
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
    expect(searchProjects).toHaveBeenCalledWith({
      action: 'browse',
      expand: 'description',
      keys: projects,
      maxResults: 100,
      startAt: 0,
    });
  });

  test('streams - projects - Jira Server', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'projects/config.json',
      catalogOrPath: 'projects/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupJiraInstance(
          {
            v2: {
              permissions: {
                getMyPermissions: jest
                  .fn()
                  .mockResolvedValue(
                    readTestResourceAsJSON('projects/permissions.json')
                  ),
              },
            },
            getAllProjects: jest
              .fn()
              .mockResolvedValue(
                readTestResourceAsJSON('projects/projects.json')
              ),
          },
          false,
          res.config as JiraConfig,
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - projects - Jira Server - project list', async () => {
    await sourceReadTest({
      source,
      configOrPath: {
        ...readTestResourceAsJSON('projects/config.json'),
        projects: ['TEST-1', 'TEST-2'],
      },
      catalogOrPath: 'projects/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupJiraInstance(
          {
            v2: {
              permissions: {
                getMyPermissions: jest
                  .fn()
                  .mockResolvedValue(
                    readTestResourceAsJSON('projects/permissions.json')
                  ),
              },
            },
            getAllProjects: jest
              .fn()
              .mockResolvedValue(
                readTestResourceAsJSON('projects/projects.json')
              ),
          },
          false,
          res.config as JiraConfig,
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - boards', async () => {
    await sourceReadTest({
      source,
      configOrPath: config,
      catalogOrPath: 'boards/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupJiraInstance(
          {
            agile: {
              board: {
                getAllBoards: paginate(
                  readTestResourceAsJSON('boards/boards.json')
                ),
              },
            },
          },
          true,
          res.config as JiraConfig,
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - project versions', async () => {
    await sourceReadTest({
      source,
      configOrPath: config,
      catalogOrPath: 'project_versions/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupJiraInstance(
          {
            v2: {
              projectVersions: {
                getProjectVersionsPaginated: paginate(
                  readTestResourceAsJSON(
                    'project_versions/project_versions.json'
                  )
                ),
              },
            },
          },
          true,
          res.config as JiraConfig,
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - project version issues', async () => {
    const version = readTestResourceAsJSON(
      'project_versions/project_versions.json'
    )[0];
    await sourceReadTest({
      source,
      configOrPath: config,
      catalogOrPath: 'project_version_issues/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupJiraInstance(
          {
            v2: {
              issueSearch: {
                searchForIssuesUsingJql: paginate(
                  readTestResourceAsJSON(
                    'project_version_issues/project_version_issues.json'
                  ),
                  'issues'
                ),
              },
              projectVersions: {
                getProjectVersionsPaginated: paginate([version]),
              },
            },
          },
          true,
          res.config as JiraConfig,
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - teams', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'teams/config.json',
      catalogOrPath: 'teams/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupJiraInstance(
          {
            graphql: jest
              .fn()
              .mockResolvedValue(readTestResourceAsJSON('teams/teams.json')),
          },
          true,
          res.config as JiraConfig,
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - team memberships', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'team_memberships/config.json',
      catalogOrPath: 'team_memberships/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupJiraInstance(
          {
            graphql: jest
              .fn()
              .mockResolvedValue(readTestResourceAsJSON('teams/teams.json')),
            getTeamMemberships: jest
              .fn()
              .mockResolvedValue(
                readTestResourceAsJSON('team_memberships/team_memberships.json')
              ),
          },
          true,
          res.config as JiraConfig,
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - additional fields', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'issue_additional_fields/config.json',
      catalogOrPath: 'issue_additional_fields/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupJiraInstance(
          {
            v2: {
              issueSearch: {
                searchForIssuesUsingJql: paginate(
                  readTestResourceAsJSON(
                    'issue_additional_fields/issues_with_additional_fields.json'
                  ),
                  'issues'
                ),
              },
            },
          },
          true,
          res.config as JiraConfig,
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('onBeforeRead with run_mode WebhookSupplement should filter streams', async () => {
    const source = new sut.JiraSource(logger);
    const catalog = readTestResourceAsJSON('common/catalog.json');
    const {catalog: newCatalog} = await source.onBeforeRead(
      {...config, run_mode: RunMode.WebhookSupplement},
      catalog
    );
    expect(newCatalog).toMatchSnapshot();
  });

  test('onBeforeRead without run_mode defaults to full mode streams', async () => {
    const source = new sut.JiraSource(logger);
    const catalog = readTestResourceAsJSON('common/catalog.json');
    const {catalog: newCatalog} = await source.onBeforeRead(
      {...config, run_mode: RunMode.Full},
      catalog
    );
    expect(newCatalog).toMatchSnapshot();
  });

  test('onBeforeRead with projects and excluded_projects defined should remove excluded_projects from config', async () => {
    const source = new sut.JiraSource(logger);
    const catalog = readTestResourceAsJSON('common/catalog.json');
    const {config: processedConfig} = await source.onBeforeRead(
      {...config, projects: ['TEST'], excluded_projects: ['TEST2']},
      catalog
    );
    expect(processedConfig.excluded_projects).toBeUndefined();
  });

  test('onBeforeRead with boards and excluded_boards defined should remove excluded_boards from config', async () => {
    const source = new sut.JiraSource(logger);
    const catalog = readTestResourceAsJSON('common/catalog.json');
    const {config: processedConfig} = await source.onBeforeRead(
      {...config, boards: ['1'], excluded_boards: ['2']},
      catalog
    );
    expect(processedConfig.excluded_boards).toBeUndefined();
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
});
