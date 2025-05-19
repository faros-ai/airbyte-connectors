import {
  AirbyteLogger,
  AirbyteLogLevel,
  readTestResourceAsJSON,
} from 'faros-airbyte-cdk';

import {GitLab} from '../src/gitlab';
import {GroupFilter} from '../src/group-filter';
import {GitLabConfig} from '../src/types';

describe('GroupFilter', () => {
  const logger = new AirbyteLogger(AirbyteLogLevel.DEBUG);
  const config: GitLabConfig = readTestResourceAsJSON('config.json');

  beforeEach(() => {
    // Mock GitLab.instance for all tests
    jest.spyOn(GitLab, 'instance').mockResolvedValue({
      getGroupsIterator: jest.fn().mockImplementation(function* () {
        for (const group of ['group-1', 'group-2', 'group-3']) {
          yield group;
        }
      }),
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

    // Mock an empty iterator for this specific test
    (GitLab.instance as jest.Mock).mockResolvedValueOnce({
      getGroupsIterator: jest.fn().mockImplementation(function* () {
        // Empty iterator - no groups
      }),
    } as any);

    await expect(filter.getGroups()).rejects.toThrow(
      'No visible groups remain after applying inclusion and exclusion filters'
    );
  });
});
