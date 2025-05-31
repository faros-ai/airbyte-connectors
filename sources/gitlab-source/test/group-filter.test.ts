import {
  AirbyteLogger,
  AirbyteLogLevel
} from 'faros-airbyte-cdk';
import {
  readTestResourceAsJSON
} from 'faros-airbyte-testing-tools';

import {GitLab} from '../src/gitlab';
import {GroupFilter} from '../src/group-filter';
import {GitLabConfig} from '../src/types';

describe('GroupFilter', () => {
  const logger = new AirbyteLogger(AirbyteLogLevel.DEBUG);
  const config: GitLabConfig = readTestResourceAsJSON('config.json');

  beforeEach(() => {
    // Mock GitLab.instance for all tests
    jest.spyOn(GitLab, 'instance').mockResolvedValue({
      getGroups: jest.fn().mockResolvedValue([
        {id: 'group-1', name: 'Group 1', path: 'group-1'},
        {id: 'group-2', name: 'Group 2', path: 'group-2'},
        {id: 'group-3', name: 'Group 3', path: 'group-3'},
      ]),
      getGroup: jest.fn().mockImplementation((groupId: string) => {
        const groups = {
          'group-1': {id: 'group-1', name: 'Group 1', path: 'group-1'},
          'group-2': {id: 'group-2', name: 'Group 2', path: 'group-2'},
          'group-3': {id: 'group-3', name: 'Group 3', path: 'group-3'},
        };
        return Promise.resolve(groups[groupId]);
      }),
      getProjects: jest.fn().mockResolvedValue([]),
    } as any);
  });

  afterEach(() => {
    (GroupFilter as any)._instance = undefined;
    jest.restoreAllMocks();
  });

  test('getGroups - no filters', async () => {
    const filter = new GroupFilter(config, logger);
    const groups = await filter.getGroups();
    expect(groups).toEqual(['group-1', 'group-2', 'group-3']);
  });

  test('getGroups - with inclusion filter', async () => {
    const configWithFilter = {
      ...config,
      groups: ['group-1', 'group-3'],
    };
    const filter = new GroupFilter(configWithFilter, logger);

    const groups = await filter.getGroups();
    expect(groups).toEqual(['group-1', 'group-3']);
  });

  test('getGroups - with exclusion filter', async () => {
    const configWithFilter = {
      ...config,
      excluded_groups: ['group-2'],
    };
    const filter = new GroupFilter(configWithFilter, logger);

    const groups = await filter.getGroups();
    expect(groups).toEqual(['group-1', 'group-3']);
  });

  test('getGroups - with both filters', async () => {
    const configWithFilter = {
      ...config,
      groups: ['group-1', 'group-2', 'group-3'],
      excluded_groups: ['group-2'],
    };
    const filter = new GroupFilter(configWithFilter, logger);

    const groups = await filter.getGroups();
    // When groups are specified, excluded_groups is not applied
    expect(groups).toEqual(['group-1', 'group-2', 'group-3']);
  });

  test('getGroups - no groups after filtering', async () => {
    const configWithFilter = {
      ...config,
      groups: [],
      excluded_groups: ['group-1'],
    };
    const filter = new GroupFilter(configWithFilter, logger);

    // Mock an empty array for this specific test
    (GitLab.instance as jest.Mock).mockResolvedValueOnce({
      getGroups: jest.fn().mockResolvedValue([]),
      getGroup: jest.fn(),
      getProjects: jest.fn().mockResolvedValue([]),
    } as any);

    await expect(filter.getGroups()).rejects.toThrow(
      'No visible groups remain after applying inclusion and exclusion filters'
    );
  });
});
