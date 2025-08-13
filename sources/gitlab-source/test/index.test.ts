import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
} from 'faros-airbyte-cdk';
import {
  readResourceAsJSON,
  readTestResourceAsJSON,
  sourceCheckTest,
  sourceReadTest,
  sourceSchemaTest,
} from 'faros-airbyte-testing-tools';

import {GitLab} from '../src/gitlab';
import {GroupFilter} from '../src/group-filter';
import * as sut from '../src/index';
import {UserCollector} from '../src/user-collector';

// Test data factories
const createTestGroup = (overrides = {}): any => ({
  id: '1',
  parent_id: null,
  name: 'Test Group',
  path: 'test-group',
  web_url: 'https://gitlab.com/test-group',
  description: 'Test group description',
  visibility: 'public',
  created_at: '2021-01-01T00:00:00Z',
  updated_at: '2021-01-01T00:00:00Z',
  ...overrides,
});

const createTestProject = (overrides = {}): any => ({
  id: '123',
  name: 'Test Project',
  path: 'test-project',
  path_with_namespace: 'test-group/test-project',
  web_url: 'https://gitlab.com/test-group/test-project',
  description: 'Test project description',
  visibility: 'public',
  created_at: '2021-01-01T00:00:00Z',
  updated_at: '2021-06-01T00:00:00Z',
  namespace: {
    id: '1',
    name: 'Test Group',
    path: 'test-group',
    kind: 'group',
    full_path: 'test-group',
  },
  group_id: '1',
  default_branch: 'main',
  archived: false,
  ...overrides,
});

const createTestUsers = (): any[] => [
  {
    id: 1,
    username: 'user1',
    name: 'Test User 1',
    email: 'user1@example.com',
    state: 'active',
    web_url: 'https://gitlab.com/user1',
    created_at: '2021-01-01T00:00:00Z',
    updated_at: '2021-01-01T00:00:00Z',
  },
  {
    id: 2,
    username: 'user2',
    name: 'Test User 2',
    email: 'user2@example.com',
    state: 'active',
    web_url: 'https://gitlab.com/user2',
    created_at: '2021-02-01T00:00:00Z',
    updated_at: '2021-02-01T00:00:00Z',
  },
];

// Helper to create async generator mock
async function* createAsyncGeneratorMock<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}

// Common mock setup functions
function setupBasicMocks(): any {
  const testGroup = createTestGroup();
  const testProject = createTestProject();
  const testUsers = createTestUsers();

  const mockUserCollector = {
    collectUser: jest.fn(),
    getCommitAuthor: jest.fn(),
    getCollectedUsers: jest
      .fn()
      .mockReturnValue(
        new Map(
          testUsers.map((user) => [
            user.username,
            UserCollector.toOutput({...user, group_ids: [testGroup.id]}),
          ])
        )
      ),
    clear: jest.fn(),
  };

  const gitlab = {
    getGroups: jest.fn().mockResolvedValue([testGroup]),
    getGroup: jest.fn().mockResolvedValue(testGroup),
    getProjects: jest.fn().mockResolvedValue([testProject]),
    fetchGroupMembers: jest.fn().mockImplementation(async (groupId: string) => {
      for (const user of testUsers) {
        mockUserCollector.collectUser(user, groupId);
      }
    }),
    fetchProjectMembers: jest.fn().mockImplementation(),
    getCommits: jest.fn().mockReturnValue(createAsyncGeneratorMock([])),
    getTags: jest.fn().mockReturnValue(createAsyncGeneratorMock([])),
    getMergeRequestsWithNotes: jest
      .fn()
      .mockReturnValue(createAsyncGeneratorMock([])),
    getMergeRequestEvents: jest
      .fn()
      .mockReturnValue(createAsyncGeneratorMock([])),
    getIssues: jest.fn().mockReturnValue(createAsyncGeneratorMock([])),
    getReleases: jest.fn().mockReturnValue(createAsyncGeneratorMock([])),
    getDeployments: jest.fn().mockReturnValue(createAsyncGeneratorMock([])),
    userCollector: mockUserCollector,
  };

  const groupFilter = {
    getGroups: jest.fn().mockResolvedValue(['test-group']),
    getProjects: jest.fn().mockResolvedValue([
      {
        repo: testProject,
        syncRepoData: true,
      },
    ]),
  };

  jest.spyOn(GitLab, 'instance').mockResolvedValue(gitlab as any);
  jest.spyOn(GroupFilter, 'instance').mockReturnValue(groupFilter as any);

  return {gitlab, groupFilter, testGroup, testProject, mockUserCollector};
}

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const source = new sut.GitLabSource(logger);

  afterEach(() => {
    jest.restoreAllMocks();
    (GitLab as any).gitlab = undefined;
    (GroupFilter as any)._instance = undefined;
  });

  test('spec', async () => {
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceAsJSON('spec.json'))
    );
  });

  function checkConnectionMock(): void {
    jest.spyOn(GitLab, 'instance').mockResolvedValue({
      checkConnection: jest.fn().mockResolvedValue(undefined),
    } as any);
    jest.spyOn(GroupFilter, 'instance').mockReturnValue({
      getGroups: jest.fn().mockResolvedValue(['Group-1']),
    } as any);
  }

  test('check connection - token valid', async () => {
    checkConnectionMock();
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/token_valid.json',
    });
  });

  test('check connection - token missing', async () => {
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/token_invalid.json',
    });
  });

  test('check connection - authentication missing', async () => {
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/authentication_missing.json',
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

  test('streams - json schema fields', () => {
    const source = new sut.GitLabSource(logger);
    sourceSchemaTest(source, readTestResourceAsJSON('config.json'));
  });

  test('streams - faros groups', async () => {
    setupBasicMocks();

    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'faros_groups/catalog.json',
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - faros projects', async () => {
    setupBasicMocks();

    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'faros_projects/catalog.json',
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - faros tags', async () => {
    const tags = readTestResourceAsJSON('faros_tags/tags.json');
    const {gitlab} = setupBasicMocks();
    gitlab.getTags.mockReturnValue(createAsyncGeneratorMock(tags));

    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'faros_tags/catalog.json',
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });

    expect(gitlab.getTags).toHaveBeenCalledWith('test-group/test-project');
  });

  test('streams - faros users', async () => {
    setupBasicMocks();

    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'users/catalog.json',
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - faros commits', async () => {
    const commits = readTestResourceAsJSON('faros_commits/commits.json');
    const {gitlab} = setupBasicMocks();
    gitlab.getCommits.mockReturnValue(createAsyncGeneratorMock(commits));

    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'faros_commits/catalog.json',
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });

    expect(gitlab.getCommits).toHaveBeenCalledWith(
      'test-group/test-project',
      'main',
      expect.any(Date),
      expect.any(Date)
    );
  });

  test('streams - faros merge requests', async () => {
    const mergeRequests = [
      {
        id: 'gid://gitlab/MergeRequest/1',
        iid: 1,
        createdAt: '2021-01-01T00:00:00Z',
        updatedAt: '2021-01-02T00:00:00Z',
        mergedAt: null,
        closedAt: null,
        author: {
          name: 'Test User',
          publicEmail: 'test@example.com',
          username: 'testuser',
          webUrl: 'https://gitlab.com/testuser',
        },
        assignees: {
          nodes: [
            {
              name: 'Assignee User',
              publicEmail: 'assignee@example.com',
              username: 'assigneeuser',
              webUrl: 'https://gitlab.com/assigneeuser',
            },
          ],
        },
        mergeCommitSha: null,
        commitCount: 2,
        userNotesCount: 1,
        diffStatsSummary: {
          additions: 10,
          deletions: 5,
          fileCount: 3,
        },
        state: 'opened',
        title: 'Test Merge Request',
        webUrl: 'https://gitlab.com/test-group/test-project/-/merge_requests/1',
        notes: [
          {
            id: 'gid://gitlab/Note/1',
            author: {
              name: 'Note Author',
              publicEmail: 'noteauthor@example.com',
              username: 'noteauthor',
              webUrl: 'https://gitlab.com/noteauthor',
            },
            body: 'Test note',
            system: false,
            createdAt: '2021-01-01T01:00:00Z',
            updatedAt: '2021-01-01T01:00:00Z',
          },
        ],
        labels: {
          pageInfo: {
            endCursor: null,
            hasNextPage: false,
          },
          nodes: [
            {
              title: 'bug',
            },
          ],
        },
        project_path: 'test-group/test-project',
      },
    ];
    const {gitlab} = setupBasicMocks();
    gitlab.getMergeRequestsWithNotes.mockReturnValue(
      createAsyncGeneratorMock(mergeRequests)
    );

    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'faros_merge_requests/catalog.json',
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });

    expect(gitlab.getMergeRequestsWithNotes).toHaveBeenCalledWith(
      'test-group/test-project',
      expect.any(Date),
      expect.any(Date)
    );
  });

  test('streams - faros merge request reviews', async () => {
    const reviews = [
      {
        id: '123',
        action_name: 'approved',
        target_iid: 1,
        target_type: 'merge_request',
        author: {
          name: 'Reviewer',
          public_email: 'reviewer@example.com',
          username: 'reviewer',
          web_url: 'https://gitlab.com/reviewer',
        },
        created_at: '2021-01-01T02:00:00Z',
        project_path: 'test-group/test-project',
      },
    ];
    const {gitlab} = setupBasicMocks();
    gitlab.getMergeRequestEvents.mockReturnValue(
      createAsyncGeneratorMock(reviews)
    );

    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'faros_merge_request_reviews/catalog.json',
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });

    expect(gitlab.getMergeRequestEvents).toHaveBeenCalledWith(
      'test-group/test-project',
      expect.any(Date),
      expect.any(Date)
    );
  });

  test('streams - faros commits with state', async () => {
    const commits = readTestResourceAsJSON('faros_commits/commits.json');
    const {gitlab} = setupBasicMocks();
    gitlab.getCommits.mockReturnValue(
      createAsyncGeneratorMock(
        commits.map((commit) => ({
          ...commit,
          group: 'test-group',
          project: 'test-group/test-project',
          branch: 'main',
        }))
      )
    );

    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'faros_commits/catalog.json',
      stateOrPath: {
        faros_commits: {
          '1/test-group/test-project': {
            cutoff: 1642248000000, // 2022-01-15T12:00:00Z
          },
        },
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
      checkFinalState: (state) => {
        expect(state).toMatchSnapshot();
      },
    });
  });

  test('streams - faros issues', async () => {
    const issues = readTestResourceAsJSON('faros_issues/issues.json');
    const {gitlab} = setupBasicMocks();
    gitlab.getIssues.mockReturnValue(createAsyncGeneratorMock(issues));

    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'faros_issues/catalog.json',
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });

    expect(gitlab.getIssues).toHaveBeenCalledWith(
      'test-group/test-project',
      expect.any(Date),
      expect.any(Date)
    );
  });

  test('streams - faros releases', async () => {
    const releases = [
      {
        tag_name: 'v1.0.0',
        name: 'Release 1.0.0',
        description: 'First major release',
        created_at: '2021-01-01T00:00:00Z',
        released_at: '2021-01-01T12:00:00Z',
        _links: {
          self: 'https://gitlab.com/test-group/test-project/-/releases/v1.0.0',
        },
      },
      {
        tag_name: 'v0.9.0',
        name: 'Release 0.9.0',
        description: 'Beta release',
        created_at: '2020-12-01T00:00:00Z',
        released_at: '2020-12-01T12:00:00Z',
        _links: {
          self: 'https://gitlab.com/test-group/test-project/-/releases/v0.9.0',
        },
      },
    ];
    const {gitlab} = setupBasicMocks();
    gitlab.getReleases.mockReturnValue(createAsyncGeneratorMock(releases));

    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'faros_releases/catalog.json',
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });

    expect(gitlab.getReleases).toHaveBeenCalledWith(
      'test-group/test-project',
      expect.any(Date),
      expect.any(Date)
    );
  });

  test('streams - faros deployments', async () => {
    const deployments = readTestResourceAsJSON(
      'faros_deployments/deployments.json'
    );
    const {gitlab} = setupBasicMocks();
    gitlab.getDeployments.mockReturnValue(
      createAsyncGeneratorMock(deployments)
    );

    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'faros_deployments/catalog.json',
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });

    expect(gitlab.getDeployments).toHaveBeenCalledWith(
      'test-group/test-project',
      expect.any(Date),
      expect.any(Date)
    );
  });

  test('round robin bucket execution', async () => {
    jest.spyOn(GitLab, 'instance').mockResolvedValue({
      checkConnection: jest.fn().mockResolvedValue(undefined),
      getGroups: jest.fn().mockResolvedValue([
        {
          id: '1',
          parent_id: null,
          name: 'Test Group',
          path: 'test-group',
        },
      ]),
    } as any);

    const config = readTestResourceAsJSON('config.json');
    const catalog = readTestResourceAsJSON('faros_groups/catalog.json');
    const {config: newConfig, state: newState} = await source.onBeforeRead(
      {...config, round_robin_bucket_execution: true, bucket_total: 3},
      catalog,
      {__bucket_execution_state: {last_executed_bucket_id: 1}}
    );
    expect(newConfig.bucket_id).toBe(2);
    expect(newState).toMatchSnapshot();
  });

  describe('onBeforeRead - groups inclusion/exclusion logic', () => {
    const catalog = readTestResourceAsJSON('faros_groups/catalog.json');

    test('should include all groups when no inclusion/exclusion filters are specified', async () => {
      jest.spyOn(GitLab, 'instance').mockResolvedValue({
        getGroups: jest.fn().mockResolvedValue([
          {id: '1', parent_id: null, name: 'Group 1'},
          {id: '2', parent_id: null, name: 'Group 2'},
          {id: '3', parent_id: '1', name: 'Group 3'},
        ]),
      } as any);

      const config = readTestResourceAsJSON('config.json');
      const {config: newConfig} = await source.onBeforeRead(config, catalog);

      expect(newConfig.groups).toEqual(['1', '2', '3']);
      expect(newConfig.excluded_groups).toBeUndefined();
    });

    test('should include only specified groups when inclusion filter is set', async () => {
      jest.spyOn(GitLab, 'instance').mockResolvedValue({
        getGroups: jest.fn().mockResolvedValue([
          {id: '1', parent_id: null, name: 'Group 1'},
          {id: '2', parent_id: null, name: 'Group 2'},
          {id: '3', parent_id: '1', name: 'Group 3'},
        ]),
      } as any);

      const config = {...readTestResourceAsJSON('config.json'), groups: ['1']};
      const {config: newConfig} = await source.onBeforeRead(config, catalog);

      expect(newConfig.groups).toEqual(['1', '3']); // Group 3 is included because its parent is in the inclusion list
      expect(newConfig.excluded_groups).toBeUndefined();
    });

    test('should exclude specified groups and their descendants', async () => {
      jest.spyOn(GitLab, 'instance').mockResolvedValue({
        getGroups: jest.fn().mockResolvedValue([
          {id: '1', parent_id: null, name: 'Group 1'},
          {id: '2', parent_id: null, name: 'Group 2'},
          {id: '3', parent_id: '1', name: 'Group 3'},
          {id: '4', parent_id: '3', name: 'Group 4'},
        ]),
      } as any);

      const config = {
        ...readTestResourceAsJSON('config.json'),
        excluded_groups: ['1'],
      };
      const {config: newConfig} = await source.onBeforeRead(config, catalog);

      expect(newConfig.groups).toEqual(['2']); // Groups 1, 3, and 4 are excluded
      expect(newConfig.excluded_groups).toBeUndefined();
    });

    test('should handle complex hierarchy with both inclusion and exclusion', async () => {
      jest.spyOn(GitLab, 'instance').mockResolvedValue({
        getGroups: jest.fn().mockResolvedValue([
          {id: '1', parent_id: null, name: 'Root 1'},
          {id: '2', parent_id: null, name: 'Root 2'},
          {id: '3', parent_id: '1', name: 'Child 1-1'},
          {id: '4', parent_id: '1', name: 'Child 1-2'},
          {id: '5', parent_id: '3', name: 'Grandchild 1-1-1'},
          {id: '6', parent_id: '2', name: 'Child 2-1'},
        ]),
      } as any);

      const config = {
        ...readTestResourceAsJSON('config.json'),
        groups: ['1'],
        excluded_groups: ['3'],
      };
      const {config: newConfig} = await source.onBeforeRead(config, catalog);

      expect(newConfig.groups).toEqual(['1', '4']); // Group 3 and its descendant 5 are excluded
      expect(newConfig.excluded_groups).toBeUndefined();
    });

    test('should throw error when groups appear in both inclusion and exclusion lists', async () => {
      jest.spyOn(GitLab, 'instance').mockResolvedValue({
        getGroups: jest
          .fn()
          .mockResolvedValue([{id: '1', parent_id: null, name: 'Group 1'}]),
      } as any);

      const config = {
        ...readTestResourceAsJSON('config.json'),
        groups: ['1', '2'],
        excluded_groups: ['2', '3'],
      };

      await expect(source.onBeforeRead(config, catalog)).rejects.toThrow(
        'Groups 2 found in both groups and excluded_groups lists'
      );
    });

    test('should throw error when no groups remain after filtering', async () => {
      jest.spyOn(GitLab, 'instance').mockResolvedValue({
        getGroups: jest
          .fn()
          .mockResolvedValue([{id: '1', parent_id: null, name: 'Group 1'}]),
      } as any);

      const config = {
        ...readTestResourceAsJSON('config.json'),
        excluded_groups: ['1'],
      };

      await expect(source.onBeforeRead(config, catalog)).rejects.toThrow(
        'No visible groups remain after applying inclusion and exclusion filters'
      );
    });

    test('should handle exclusion taking precedence over inclusion in hierarchy', async () => {
      jest.spyOn(GitLab, 'instance').mockResolvedValue({
        getGroups: jest.fn().mockResolvedValue([
          {id: '1', parent_id: null, name: 'Root'},
          {id: '2', parent_id: '1', name: 'Parent'},
          {id: '3', parent_id: '2', name: 'Child'},
          {id: '4', parent_id: '3', name: 'Grandchild'},
        ]),
      } as any);

      const config = {
        ...readTestResourceAsJSON('config.json'),
        groups: ['1'],
        excluded_groups: ['2'],
      };
      const {config: newConfig} = await source.onBeforeRead(config, catalog);

      expect(newConfig.groups).toEqual(['1']); // Groups 2, 3, and 4 are excluded despite 1 being included
    });

    test('should exclude groups when only exclusion filter is specified', async () => {
      jest.spyOn(GitLab, 'instance').mockResolvedValue({
        getGroups: jest.fn().mockResolvedValue([
          {id: '1', parent_id: null, name: 'Group 1'},
          {id: '2', parent_id: null, name: 'Group 2'},
          {id: '3', parent_id: null, name: 'Group 3'},
          {id: '4', parent_id: '2', name: 'Group 4'},
        ]),
      } as any);

      const config = {
        ...readTestResourceAsJSON('config.json'),
        excluded_groups: ['2'],
      };
      const {config: newConfig} = await source.onBeforeRead(config, catalog);

      expect(newConfig.groups).toEqual(['1', '3']); // Groups 2 and 4 are excluded
    });

    test('should not include groups when inclusion filter is specified but they are not in hierarchy', async () => {
      jest.spyOn(GitLab, 'instance').mockResolvedValue({
        getGroups: jest.fn().mockResolvedValue([
          {id: '1', parent_id: null, name: 'Group 1'},
          {id: '2', parent_id: null, name: 'Group 2'},
          {id: '3', parent_id: null, name: 'Group 3'},
        ]),
      } as any);

      const config = {
        ...readTestResourceAsJSON('config.json'),
        groups: ['1'],
      };
      const {config: newConfig} = await source.onBeforeRead(config, catalog);

      expect(newConfig.groups).toEqual(['1']); // Only group 1 is included, 2 and 3 are not
    });
  });
});
