import {
  AirbyteLogger,
  AirbyteLogLevel,
  readTestResourceAsJSON,
} from 'faros-airbyte-cdk';

import {OrgRepoFilter} from '../src/org-repo-filter';
import {GitHubConfig} from '../src/types';
import {setupGitHubInstance} from './utils';

describe('OrgRepoFilter', () => {
  const logger = new AirbyteLogger(AirbyteLogLevel.DEBUG);
  const config: GitHubConfig = readTestResourceAsJSON('config.json');

  beforeAll(() => {
    setupGitHubInstance(
      {
        orgs: {
          listForAuthenticatedUser: jest
            .fn()
            .mockReturnValue([
              {login: 'org-1'},
              {login: 'org-2'},
              {login: 'org-3'},
            ]),
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
});

const getAllRepositories = async (orgRepoFilter: OrgRepoFilter) => {
  return [
    ...(await orgRepoFilter.getRepositories('org-1')),
    ...(await orgRepoFilter.getRepositories('org-2')),
    ...(await orgRepoFilter.getRepositories('org-3')),
  ];
};
