import {AirbyteLogger, AirbyteLogLevel} from 'faros-airbyte-cdk';

import {GitLab} from '../src/gitlab';
import {GroupRepoFilter} from '../src/streams/common';

jest.mock('../src/gitlab');

describe('group-repo-filter', () => {
  const logger = new AirbyteLogger(
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getGroups - with specified groups', async () => {
    const config = {
      token: 'test_token',
      groups: ['group1', 'group2'],
    };

    const filter = await GroupRepoFilter.instance(config, logger);
    const groups = await filter.getGroups();

    expect(groups).toEqual(['group1', 'group2']);
  });

  test('getGroups - fetch all groups', async () => {
    const config = {
      token: 'test_token',
    };

    const mockGitLab = {
      instance: jest.fn().mockResolvedValue({
        listGroups: jest.fn().mockImplementation(async function* () {
          yield {id: 1, path: 'group1', name: 'Group 1'};
          yield {id: 2, path: 'group2', name: 'Group 2'};
          yield {id: 3, path: 'group3', name: 'Group 3'};
        }),
      }),
    };
    GitLab.instance = mockGitLab.instance;

    const filter = await GroupRepoFilter.instance(config, logger);
    const groups = await filter.getGroups();

    expect(groups).toEqual(['group1', 'group2', 'group3']);
  });

  test('getGroups - with excluded groups', async () => {
    const config = {
      token: 'test_token',
      excluded_groups: ['group2'],
    };

    const mockGitLab = {
      instance: jest.fn().mockResolvedValue({
        listGroups: jest.fn().mockImplementation(async function* () {
          yield {id: 1, path: 'group1', name: 'Group 1'};
          yield {id: 2, path: 'group2', name: 'Group 2'};
          yield {id: 3, path: 'group3', name: 'Group 3'};
        }),
      }),
    };
    GitLab.instance = mockGitLab.instance;

    const filter = await GroupRepoFilter.instance(config, logger);
    const groups = await filter.getGroups();

    expect(groups).toEqual(['group1', 'group3']);
  });
});
