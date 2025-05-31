import {
  AirbyteLogger,
  AirbyteLogLevel
} from 'faros-airbyte-cdk';
import {
  readTestResourceAsJSON
} from 'faros-airbyte-testing-tools';

import {OrgRepoFilter} from '../src/org-repo-filter';
import {RunMode} from '../src/streams/common';
import {GitHubConfig} from '../src/types';
import {iterate, setupGitHubInstance} from './utils';

describe('OrgRepoFilter', () => {
  const logger = new AirbyteLogger(AirbyteLogLevel.DEBUG);
  const config: GitHubConfig = readTestResourceAsJSON('config.json');

  beforeEach(() => {
    setupGitHubInstance(
      {
        orgs: {
          listForAuthenticatedUser: jest
            .fn()
            .mockReturnValue([
              {login: 'Org-1'},
              {login: 'Org-2'},
              {login: 'Org-3'},
            ]),
          get: jest.fn().mockRejectedValue(new Error('404')),
        },
        repos: {
          listForOrg: jest
            .fn()
            .mockReturnValue([
              {name: 'repo-1'},
              {name: 'repo-2'},
              {name: 'repo-3'},
            ]),
        },
      },
      logger
    );
  });

  test('getOrganizations - all - no list', async () => {
    const orgRepoFilter = new OrgRepoFilter(config, logger);
    const organizations = await orgRepoFilter.getOrganizations();
    expect(organizations).toMatchSnapshot();
  });

  test('getOrganizations - all - empty list', async () => {
    const orgRepoFilter = new OrgRepoFilter(
      {
        ...config,
        organizations: [],
      },
      logger
    );
    const organizations = await orgRepoFilter.getOrganizations();
    expect(organizations).toMatchSnapshot();
  });

  test('getOrganizations - specific organizations included', async () => {
    const orgRepoFilter = new OrgRepoFilter(
      {
        ...config,
        organizations: ['org-1', 'org-2'],
      },
      logger
    );
    const organizations = await orgRepoFilter.getOrganizations();
    expect(organizations).toMatchSnapshot();
  });

  test('getOrganizations - fetch public orgs', async () => {
    const publicOrgsConfig = {
      ...config,
      fetch_public_organizations: true,
    };
    setupGitHubInstance(
      {
        orgs: {
          listForAuthenticatedUser: jest
            .fn()
            .mockReturnValue([{login: 'Org-1'}]),
          list: jest.fn().mockReturnValue([{login: 'Org-2'}]),
        },
      },
      logger,
      publicOrgsConfig
    );
    const orgRepoFilter = new OrgRepoFilter(publicOrgsConfig, logger);
    const organizations = await orgRepoFilter.getOrganizations();
    expect(organizations).toMatchSnapshot();
  });

  test('getOrganizations - visible organization not in listForAuthenticatedUser', async () => {
    setupGitHubInstance(
      {
        orgs: {
          listForAuthenticatedUser: jest
            .fn()
            .mockReturnValue([{login: 'Org-1'}]),
          get: jest.fn().mockResolvedValue({login: 'Org-OSS'}),
        },
      },
      logger
    );
    const orgRepoFilter = new OrgRepoFilter(
      {
        ...config,
        organizations: ['org-1', 'org-oss'],
      },
      logger
    );
    const organizations = await orgRepoFilter.getOrganizations();
    expect(organizations).toMatchSnapshot();
  });

  test('getOrganizations - specific organizations excluded', async () => {
    const orgRepoFilter = new OrgRepoFilter(
      {
        ...config,
        excluded_organizations: ['org-1', 'org-2'],
      },
      logger
    );
    const organizations = await orgRepoFilter.getOrganizations();
    expect(organizations).toMatchSnapshot();
  });

  test('getOrganizations - no visible orgs after filtering', async () => {
    let orgRepoFilter = new OrgRepoFilter(
      {
        ...config,
        excluded_organizations: ['org-1', 'org-2', 'org-3'],
      },
      logger
    );
    await expect(orgRepoFilter.getOrganizations()).rejects.toThrow(
      'No visible organizations remain after applying inclusion and exclusion filters'
    );

    orgRepoFilter = new OrgRepoFilter(
      {
        ...config,
        organizations: ['xyz'],
      },
      logger
    );
    await expect(orgRepoFilter.getOrganizations()).rejects.toThrow(
      'No visible organizations remain after applying inclusion and exclusion filters'
    );

    orgRepoFilter = new OrgRepoFilter(
      {
        ...config,
        organizations: ['xyz'],
        run_mode: RunMode.EnterpriseCopilotOnly,
      },
      logger
    );
    expect(await orgRepoFilter.getOrganizations()).toEqual([]);
  });

  test('getOrganizations - fine-grained token - no list', async () => {
    setupGitHubInstance(
      {
        orgs: {
          listForAuthenticatedUser: jest.fn().mockReturnValue([]),
        },
        repos: {
          listForAuthenticatedUser: jest.fn().mockReturnValue([
            {name: 'repo-1', owner: {login: 'Org-1', type: 'Organization'}},
            {name: 'repo-2', owner: {login: 'Org-2', type: 'Organization'}},
            {name: 'repo-3', owner: {login: 'Org-3', type: 'User'}},
          ]),
        },
      },
      logger
    );
    const orgRepoFilter = new OrgRepoFilter(config, logger);
    const organizations = await orgRepoFilter.getOrganizations();
    expect(organizations).toMatchSnapshot();
  });

  test('getRepositories - all - no list', async () => {
    const orgRepoFilter = new OrgRepoFilter(config, logger);
    const repositories = await getAllRepositories(orgRepoFilter);
    expect(repositories).toMatchSnapshot();
  });

  test('getRepositories - all - empty list', async () => {
    const orgRepoFilter = new OrgRepoFilter(
      {
        ...config,
        repositories: [],
      },
      logger
    );
    const repositories = await getAllRepositories(orgRepoFilter);
    expect(repositories).toMatchSnapshot();
  });

  test('getRepositories - specific repositories included', async () => {
    const orgRepoFilter = new OrgRepoFilter(
      {
        ...config,
        repositories: ['org-1/repo-1', 'org-2/repo-2'],
      },
      logger
    );
    const repositories = await getAllRepositories(orgRepoFilter);
    expect(repositories).toMatchSnapshot();
  });

  test('getRepositories - specific repositories excluded', async () => {
    const orgRepoFilter = new OrgRepoFilter(
      {
        ...config,
        excluded_repositories: ['org-1/repo-1', 'org-2/repo-2'],
      },
      logger
    );
    const repositories = await getAllRepositories(orgRepoFilter);
    expect(repositories).toMatchSnapshot();
  });

  test('getRepositories (FarosGraph) - Faros credentials are required', async () => {
    expect(
      () =>
        new OrgRepoFilter(
          {...config, use_faros_graph_repos_selection: true},
          logger
        )
    ).toThrow(
      expect.objectContaining({
        message: expect.stringContaining('Faros credentials are required'),
      })
    );
  });

  test('getRepositories (FarosGraph) - nothing included - nothing excluded', async () => {
    const orgRepoFilter = new OrgRepoFilter(
      {...config, use_faros_graph_repos_selection: true},
      logger,
      mockFarosOptions([])
    );
    const repositories = await getAllRepositories(orgRepoFilter);
    expect(repositories).toMatchSnapshot();
  });

  test('getRepositories (FarosGraph) - some included - nothing excluded', async () => {
    const orgRepoFilter = new OrgRepoFilter(
      {...config, use_faros_graph_repos_selection: true},
      logger,
      mockFarosOptions(['org-1/repo-1', 'org-2/repo-2'], 'Included')
    );
    const repositories = await getAllRepositories(orgRepoFilter);
    expect(repositories).toMatchSnapshot();
  });

  test('getRepositories (FarosGraph) - nothing included - some excluded', async () => {
    const orgRepoFilter = new OrgRepoFilter(
      {...config, use_faros_graph_repos_selection: true},
      logger,
      mockFarosOptions(['org-1/repo-1', 'org-2/repo-2'], 'Excluded')
    );
    const repositories = await getAllRepositories(orgRepoFilter);
    expect(repositories).toMatchSnapshot();
  });
});

const getAllRepositories = async (orgRepoFilter: OrgRepoFilter) => {
  return [
    ...(await orgRepoFilter.getRepositories('org-1')),
    ...(await orgRepoFilter.getRepositories('org-2')),
    ...(await orgRepoFilter.getRepositories('org-3')),
  ];
};

function mockFarosOptions(
  keys: string[],
  inclusionCategory?: 'Included' | 'Excluded'
): any {
  return {
    nodeIterable: () =>
      iterate(keys.map((key) => repositoryOptions(key, inclusionCategory))),
  };
}

function repositoryOptions(
  key: string,
  inclusionCategory: 'Included' | 'Excluded'
) {
  const [org, repo] = key.split('/');
  return {
    repository: {
      name: repo,
      organization: {
        uid: org,
      },
    },
    inclusionCategory,
  };
}
