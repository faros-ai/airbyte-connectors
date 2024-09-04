import {
  AirbyteLogger,
  AirbyteLogLevel,
  readTestResourceAsJSON,
} from 'faros-airbyte-cdk';

import {Bitbucket} from '../src/bitbucket';
import {BitbucketConfig} from '../src/types';
import {WorkspaceRepoFilter} from '../src/workspace-repo-filter';

const bitbucketInstance = jest.fn().mockImplementation(() => {
  return new Bitbucket(
    {
      repositories: {
        list: jest.fn().mockResolvedValue({
          data: {
            values: [{slug: 'repo-1'}, {slug: 'repo-2'}, {slug: 'repo-3'}],
          },
        }),
      },
      workspaces: {
        getWorkspaces: jest.fn().mockResolvedValue({
          data: {
            values: [
              {slug: 'workspace-1'},
              {slug: 'workspace-2'},
              {slug: 'workspace-3'},
            ],
          },
        }),
      },
      hasNextPage: jest.fn(),
    } as any,
    100,
    1,
    1,
    new AirbyteLogger()
  );
});

describe('workspaceRepoFilter', () => {
  const logger = new AirbyteLogger(AirbyteLogLevel.DEBUG);
  const config: BitbucketConfig = readTestResourceAsJSON('config.json');

  beforeEach(() => {
    Bitbucket.instance = bitbucketInstance;
  });

  test('getWorkspaces - all - no list', async () => {
    const workspaceRepoFilter = new WorkspaceRepoFilter(config, logger);
    const workspaces = await workspaceRepoFilter.getWorkspaces();
    expect(workspaces).toMatchSnapshot();
  });

  test('getWorkspaces - all - empty list', async () => {
    const workspaceRepoFilter = new WorkspaceRepoFilter(
      {
        ...config,
        workspaces: [],
      },
      logger
    );
    const workspaces = await workspaceRepoFilter.getWorkspaces();
    expect(workspaces).toMatchSnapshot();
  });

  test('getWorkspaces - specific workspaces included', async () => {
    const workspaceRepoFilter = new WorkspaceRepoFilter(
      {
        ...config,
        workspaces: ['workspace-1', 'workspace-2'],
      },
      logger
    );
    const workspaces = await workspaceRepoFilter.getWorkspaces();
    expect(workspaces).toMatchSnapshot();
  });

  test('getWorkspaces - specific workspaces excluded', async () => {
    const workspaceRepoFilter = new WorkspaceRepoFilter(
      {
        ...config,
        excluded_workspaces: ['workspace-1', 'workspace-2'],
      },
      logger
    );
    const workspaces = await workspaceRepoFilter.getWorkspaces();
    expect(workspaces).toMatchSnapshot();
  });

  test('getRepositories - all - no list', async () => {
    const workspaceRepoFilter = new WorkspaceRepoFilter(config, logger);
    const repositories = await getAllRepositories(workspaceRepoFilter);
    expect(repositories).toMatchSnapshot();
  });

  test('getRepositories - all - empty list', async () => {
    const workspaceRepoFilter = new WorkspaceRepoFilter(
      {
        ...config,
        repositories: [],
      },
      logger
    );
    const repositories = await getAllRepositories(workspaceRepoFilter);
    expect(repositories).toMatchSnapshot();
  });

  test('getRepositories - specific repositories included', async () => {
    const workspaceRepoFilter = new WorkspaceRepoFilter(
      {
        ...config,
        repositories: ['workspace-1/repo-1', 'workspace-2/repo-2'],
      },
      logger
    );
    const repositories = await getAllRepositories(workspaceRepoFilter);
    expect(repositories).toMatchSnapshot();
  });

  test('getRepositories - specific repositories excluded', async () => {
    const workspaceRepoFilter = new WorkspaceRepoFilter(
      {
        ...config,
        excluded_repositories: ['workspace-1/repo-1', 'workspace-2/repo-2'],
      },
      logger
    );
    const repositories = await getAllRepositories(workspaceRepoFilter);
    expect(repositories).toMatchSnapshot();
  });
});

const getAllRepositories = async (workspaceRepoFilter: WorkspaceRepoFilter) => {
  const repos = [
    ...(await workspaceRepoFilter.getRepositories('workspace-1')),
    ...(await workspaceRepoFilter.getRepositories('workspace-2')),
    ...(await workspaceRepoFilter.getRepositories('workspace-3')),
  ];
  return repos.map((repo) => ({slug: repo.slug, workspace: repo.workspace}));
};
