import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  readTestResourceAsJSON,
  sourceCheckTest,
  sourceReadTest,
  sourceSchemaTest,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';

import {GitLab} from '../src/gitlab';
import {GroupFilter} from '../src/group-filter';
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

  const source = new sut.GitLabSource(logger);

  afterEach(() => {
    jest.restoreAllMocks();
    (GitLab as any).gitlab = undefined;
    (GroupFilter as any)._instance = undefined;
  });

  test('spec', async () => {
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
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
    const gitlab = {
      getGroups: jest.fn().mockResolvedValue([
        {
          id: '1',
          parent_id: null,
          name: 'Test Group',
          path: 'test-group',
          web_url: 'https://gitlab.com/test-group',
          description: 'Test group description',
          visibility: 'public',
          created_at: '2021-01-01T00:00:00Z',
          updated_at: '2021-01-01T00:00:00Z',
        },
      ]),
      getGroup: jest.fn().mockResolvedValue({
        id: '1',
        parent_id: null,
        name: 'Test Group',
        path: 'test-group',
        web_url: 'https://gitlab.com/test-group',
        description: 'Test group description',
        visibility: 'public',
        created_at: '2021-01-01T00:00:00Z',
        updated_at: '2021-01-01T00:00:00Z',
      }),
    };

    const groupFilter = {
      getGroups: jest.fn().mockResolvedValue(['test-group']),
    };

    jest.spyOn(GitLab, 'instance').mockResolvedValue(gitlab as any);
    jest.spyOn(GroupFilter, 'instance').mockReturnValue(groupFilter as any);

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
    const gitlab = {
      getGroups: jest.fn().mockResolvedValue([
        {
          id: '1',
          parent_id: null,
          name: 'Test Group',
          path: 'test-group',
          web_url: 'https://gitlab.com/test-group',
          description: 'Test group description',
          visibility: 'public',
          created_at: '2021-01-01T00:00:00Z',
          updated_at: '2021-01-01T00:00:00Z',
        },
      ]),
      getProjects: jest.fn().mockResolvedValue([
        {
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
        },
      ]),
    };

    const groupFilter = {
      getGroups: jest.fn().mockResolvedValue(['test-group']),
      getProjects: jest.fn().mockResolvedValue([
        {
          repo: {
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
          },
          syncRepoData: true,
        },
      ]),
    };

    jest.spyOn(GitLab, 'instance').mockResolvedValue(gitlab as any);
    jest.spyOn(GroupFilter, 'instance').mockReturnValue(groupFilter as any);

    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'faros_projects/catalog.json',
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
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

    test('should skip group filtering when use_faros_graph_projects_selection is true', async () => {
      const config = {
        ...readTestResourceAsJSON('config.json'),
        use_faros_graph_projects_selection: true,
        groups: ['1'],
        excluded_groups: ['2'],
      };

      const {config: newConfig} = await source.onBeforeRead(config, catalog);

      // Groups and excluded_groups should be preserved
      expect(newConfig.groups).toEqual(['1']);
      expect(newConfig.excluded_groups).toEqual(['2']);
      expect(newConfig.startDate).toBeDefined();
      expect(newConfig.endDate).toBeDefined();
    });
  });
});
