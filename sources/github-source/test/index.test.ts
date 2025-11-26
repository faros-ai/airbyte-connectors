import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
} from 'faros-airbyte-cdk';
import {
  customStreamsTest,
  readResourceAsJSON,
  readTestResourceAsJSON,
  readTestResourceFile,
  sourceCheckTest,
  sourceReadTest,
  sourceSchemaTest,
} from 'faros-airbyte-testing-tools';
import {merge} from 'lodash';
import VError from 'verror';

import {GitHub, GitHubApp, GitHubToken} from '../src/github';
import * as sut from '../src/index';
import {OrgRepoFilter} from '../src/org-repo-filter';
import {CustomStreamNames} from '../src/streams/common';
import {
  ErrorWithStatus,
  graphqlMockedImplementation,
  setupGitHubInstance,
} from './utils';

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const source = new sut.GitHubSource(logger);

  afterEach(() => {
    jest.restoreAllMocks();
    (GitHub as any).github = undefined;
    (OrgRepoFilter as any)._instance = undefined;
  });

  test('spec', async () => {
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceAsJSON('spec.json'))
    );
  });

  function checkConnectionMock() {
    jest.spyOn(GitHubToken.prototype, 'checkConnection').mockResolvedValue();
    jest.spyOn(GitHubApp.prototype, 'checkConnection').mockResolvedValue();
    jest
      .spyOn(GitHubApp.prototype as any, 'getAppInstallations')
      .mockResolvedValue([]);
    jest
      .spyOn(OrgRepoFilter.prototype, 'getOrganizations')
      .mockResolvedValue(['Org-1']);
  }

  test('check connection - token valid', async () => {
    checkConnectionMock();
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/token_valid.json',
    });
  });

  test('check connection - app valid', async () => {
    checkConnectionMock();
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/app_valid.json',
    });
  });

  test('check connection - no organizations', async () => {
    checkConnectionMock();
    jest
      .spyOn(OrgRepoFilter.prototype, 'getOrganizations')
      .mockRejectedValue(
        new VError(
          'No visible organizations remain after applying inclusion and exclusion filters'
        )
      );
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/token_valid.json',
    });
  });

  test('check connection - enterprise not available using app', async () => {
    await sourceCheckTest({
      source,
      configOrPath: {
        ...readTestResourceAsJSON('check_connection/app_valid.json'),
        enterprises: ['github'],
      },
    });
  });

  test('check connection - token missing', async () => {
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/token_invalid.json',
    });
  });

  test('check connection - app invalid', async () => {
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/app_invalid.json',
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
    const source = new sut.GitHubSource(logger);
    sourceSchemaTest(source, readTestResourceAsJSON('config.json'));
  });

  test('streams - copilot seats', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'copilot_seats/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getCopilotSeatsMockedImplementation(
              readTestResourceAsJSON('copilot_seats/copilot_seats.json')
            )
          ),
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - copilot seats (empty)', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'copilot_seats/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          getCopilotSeatsMockedImplementation(
            readTestResourceAsJSON('copilot_seats/copilot_seats_empty.json')
          ),
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - copilot usage without teams (GA API)', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'copilot_usage/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getCopilotUsageForOrgGAMockedImplementation(
              readTestResourceAsJSON('copilot_usage/copilot_usage_ga.json')
            ),
            getTeamsMockedImplementation(
              new ErrorWithStatus(400, 'API not available')
            )
          ),
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - copilot usage with teams (GA API)', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'copilot_usage/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getCopilotUsageForOrgGAMockedImplementation(
              readTestResourceAsJSON('copilot_usage/copilot_usage_ga.json')
            ),
            getTeamsMockedImplementation(
              readTestResourceAsJSON('teams/teams.json')
            ),
            getCopilotUsageForTeamGAMockedImplementation(
              readTestResourceAsJSON('copilot_usage/copilot_usage_ga.json')
            )
          ),
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - copilot usage with teams already up-to-date', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'copilot_usage/catalog.json',
      stateOrPath: {
        faros_copilot_usage: {
          github: {cutoff: new Date('2024-06-24').getTime()},
        },
      },
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getCopilotUsageForOrgGAMockedImplementation(
              readTestResourceAsJSON('copilot_usage/copilot_usage_ga.json')
            ),
            getTeamsMockedImplementation(
              readTestResourceAsJSON('teams/teams.json')
            ),
            getCopilotUsageForTeamGAMockedImplementation(
              readTestResourceAsJSON('copilot_usage/copilot_usage_ga.json')
            )
          ),
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toHaveLength(0);
      },
    });
  });

  test('streams - organizations', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'organizations/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          getOrganizationMockedImplementation(
            readTestResourceAsJSON('organizations/organization.json')
          ),
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - repositories', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'repositories/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          getRepositoriesMockedImplementation(
            readTestResourceAsJSON('repositories/repositories.json')
          ),
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - repositories with languages', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'repositories/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getRepositoriesMockedImplementation(
              readTestResourceAsJSON('repositories/repositories.json')
            ),
            getRepositoryLanguagesMockedImplementation(
              readTestResourceAsJSON('repositories/repository_languages.json')
            )
          ),
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - repositories with bucketing', async () => {
    const config = readTestResourceAsJSON('repositories/config-bucketing.json');
    await sourceReadTest({
      source,
      configOrPath: config,
      catalogOrPath: 'repositories/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          getRepositoriesMockedImplementation(
            readTestResourceAsJSON('repositories/repositories-multiple.json')
          ),
          logger,
          config
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - repositories with skip repos without recent push', async () => {
    const config = {
      ...readTestResourceAsJSON('config.json'),
      skip_repos_without_recent_push: true,
      startDate: new Date(Date.now() - 1000 * 60 * 60 * 24),
    };
    const repositories = readTestResourceAsJSON(
      'repositories/repositories-multiple.json'
    );
    repositories[0].pushed_at = new Date().toISOString();
    await sourceReadTest({
      source,
      configOrPath: config,
      catalogOrPath: 'repositories/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          getRepositoriesMockedImplementation(repositories),
          logger,
          config
        );
      },
      checkRecordsData: (records) => {
        expect(records).toHaveLength(repositories.length);
        expect(records[0].recentPush).toBe(true);
        expect(records[1].recentPush).toBe(false);
      },
    });
  });

  test('streams - pull requests', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'pull_requests/catalog.json',
      stateOrPath: {
        faros_pull_requests: {
          'github/hello-world': {
            cutoff: 123,
          },
        },
      },
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getRepositoriesMockedImplementation(
              readTestResourceAsJSON('repositories/repositories.json')
            ),
            getPullRequestsMockedImplementation(
              readTestResourceAsJSON('pull_requests/pull_requests.json')
            )
          ),
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
      checkFinalState: (state) => {
        expect(state).toMatchSnapshot();
      },
    });
  });

  test('streams - pull requests backfill with bucketing and round robin execution only affects bucketing state', async () => {
    const config = readTestResourceAsJSON('config.json');
    await sourceReadTest({
      source,
      configOrPath: {
        ...config,
        bucket_id: 1,
        bucket_total: 3,
        backfill: true,
        round_robin_bucket_execution: true,
      },
      catalogOrPath: 'pull_requests/catalog.json',
      stateOrPath: {
        faros_pull_requests: {
          'github/hello-world': {
            cutoff: 123,
          },
        },
      },
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getRepositoriesMockedImplementation(
              readTestResourceAsJSON('repositories/repositories.json')
            ),
            getPullRequestsMockedImplementation(
              readTestResourceAsJSON('pull_requests/pull_requests.json')
            )
          ),
          logger
        );
      },
      checkFinalState: (state) => {
        expect(state).toMatchSnapshot();
      },
    });
  });

  test('streams - pull requests diff coverage', async () => {
    const config = readTestResourceAsJSON(
      'pull_requests/pull_requests_diff_coverage/config.json'
    );
    await sourceReadTest({
      source,
      configOrPath: config,
      catalogOrPath: 'pull_requests/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getRepositoriesMockedImplementation(
              readTestResourceAsJSON('repositories/repositories.json')
            ),
            getPullRequestsMockedImplementation(
              readTestResourceAsJSON('pull_requests/pull_requests.json')
            ),
            getListCommitStatusesForRefMockedImplementation(
              readTestResourceAsJSON(
                'pull_requests/pull_requests_diff_coverage/listCommitStatuses.json'
              )
            )
          ),
          logger,
          config
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - labels', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'labels/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getRepositoriesMockedImplementation(
              readTestResourceAsJSON('repositories/repositories.json')
            ),
            getLabelsMockedImplementation(
              readTestResourceAsJSON('labels/labels.json')
            )
          ),
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - pull request comments', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'pull_request_comments/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getRepositoriesMockedImplementation(
              readTestResourceAsJSON('repositories/repositories.json')
            ),
            getPullRequestCommentsMockedImplementation(
              readTestResourceAsJSON(
                'pull_request_comments/pull_request_comments.json'
              )
            )
          ),
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - users', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'users/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          getOrganizationMembersMockedImplementation(
            readTestResourceAsJSON('users/users.json')
          ),
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
      configOrPath: 'config.json',
      catalogOrPath: 'teams/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          getTeamsMockedImplementation(
            readTestResourceAsJSON('teams/teams.json')
          ),
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
      configOrPath: 'config.json',
      catalogOrPath: 'team_memberships/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getTeamsMockedImplementation(
              readTestResourceAsJSON('teams/teams.json')
            ),
            getTeamMembershipsMockedImplementation(
              readTestResourceAsJSON('team_memberships/team_memberships.json')
            )
          ),
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - outside collaborators', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'outside_collaborators/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          getOrganizationOutsideCollaboratorsMockedImplementation(
            readTestResourceAsJSON(
              'outside_collaborators/outside_collaborators.json'
            )
          ),
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - saml sso users', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'saml_sso_users/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          getOrganizationSamlSsoUsersMockedImplementation(
            readTestResourceAsJSON('saml_sso_users/saml_sso_users.json')
          ),
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - commits', async () => {
    const commits = readTestResourceAsJSON('commits/commits.json');
    const commitsMock = {
      graphql: jest.fn().mockResolvedValue(commits),
    };
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'commits/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getRepositoriesMockedImplementation(
              readTestResourceAsJSON('repositories/repositories.json')
            ),
            commitsMock
          ),
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
    expect(commitsMock.graphql.mock.calls).toHaveLength(2);
    const commitFields: string = commitsMock.graphql.mock.calls
      .at(-1)[0]
      .replace(/query commits.*/s, '');
    expect(commitFields).toMatchSnapshot();
  });

  test('streams - commits - additions unavailable and page size 1', async () => {
    const commits = readTestResourceAsJSON('commits/commits.json');
    const commitsMock = {
      graphql: jest
        .fn()
        .mockResolvedValueOnce(commits)
        .mockRejectedValueOnce({
          errors: [
            {
              message: 'The additions count for this commit is unavailable',
            },
          ],
        })
        .mockResolvedValueOnce(commits),
    };
    const config = {
      ...readTestResourceAsJSON('config.json'),
      commits_page_size: 1,
    };
    await sourceReadTest({
      source,
      configOrPath: config,
      catalogOrPath: 'commits/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getRepositoriesMockedImplementation(
              readTestResourceAsJSON('repositories/repositories.json')
            ),
            commitsMock
          ),
          logger,
          config
        );
      },
      checkRecordsData: (records) => {
        expect(records.length).toBeGreaterThan(0);
      },
    });
    expect(commitsMock.graphql.mock.calls).toHaveLength(3);
    const commitFields: string = commitsMock.graphql.mock.calls
      .at(-1)[0]
      .replace(/query commits.*/s, '');
    expect(commitFields).toMatchSnapshot();
  });

  test('streams - tags', async () => {
    const config = readTestResourceAsJSON('config.json');
    await sourceReadTest({
      source,
      configOrPath: config,
      catalogOrPath: 'tags/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getRepositoriesMockedImplementation(
              readTestResourceAsJSON('repositories/repositories.json')
            ),
            getRepositoryTagsMockedImplementation(
              readTestResourceAsJSON('tags/tags.json')
            )
          ),
          logger,
          config
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - releases', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'releases/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getRepositoriesMockedImplementation(
              readTestResourceAsJSON('repositories/repositories.json')
            ),
            getRepositoryReleasesMockedImplementation(
              readTestResourceAsJSON('releases/releases.json')
            )
          ),
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - projects', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'projects/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getOrganizationMockedImplementation(
              readTestResourceAsJSON('organizations/organization.json')
            ),
            getProjectsMockedImplementation(
              readTestResourceAsJSON('projects/projects.json')
            ),
            getProjectsClassicMockedImplementation(
              readTestResourceAsJSON('projects/projects-classic.json')
            )
          ),
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - issues', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'issues/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getRepositoriesMockedImplementation(
              readTestResourceAsJSON('repositories/repositories.json')
            ),
            getIssuesMockedImplementation(
              readTestResourceAsJSON('issues/issues.json')
            )
          ),
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - issue comments', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'issue_comments/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getRepositoriesMockedImplementation(
              readTestResourceAsJSON('repositories/repositories.json')
            ),
            getIssueCommentsMockedImplementation(
              readTestResourceAsJSON('issue_comments/issue_comments.json')
            )
          ),
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - code scanning alerts', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'code_scanning_alerts/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getRepositoriesMockedImplementation(
              readTestResourceAsJSON('repositories/repositories.json')
            ),
            getCodeScanningAlertsMockedImplementation(
              readTestResourceAsJSON(
                'code_scanning_alerts/code_scanning_alerts.json'
              )
            )
          ),
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - dependabot alerts', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'dependabot_alerts/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getRepositoriesMockedImplementation(
              readTestResourceAsJSON('repositories/repositories.json')
            ),
            getDependabotAlertsMockedImplementation(
              readTestResourceAsJSON('dependabot_alerts/dependabot_alerts.json')
            )
          ),
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - secret scanning alerts', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'secret_scanning_alerts/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getRepositoriesMockedImplementation(
              readTestResourceAsJSON('repositories/repositories.json')
            ),
            getSecretScanningAlertsMockedImplementation(
              readTestResourceAsJSON(
                'secret_scanning_alerts/secret_scanning_alerts.json'
              )
            )
          ),
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - workflows', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'workflows/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getRepositoriesMockedImplementation(
              readTestResourceAsJSON('repositories/repositories.json')
            ),
            getWorkflowsMockedImplementation(
              readTestResourceAsJSON('workflows/workflows.json')
            )
          ),
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - workflow runs', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'workflow_runs/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getRepositoriesMockedImplementation(
              readTestResourceAsJSON('repositories/repositories.json')
            ),
            getWorkflowRunsMockedImplementation(
              readTestResourceAsJSON('workflow_runs/workflow_runs.json')
            )
          ),
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - workflow jobs', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'workflow_jobs/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getRepositoriesMockedImplementation(
              readTestResourceAsJSON('repositories/repositories.json')
            ),
            getWorkflowRunsMockedImplementation(
              readTestResourceAsJSON('workflow_runs/workflow_runs.json')
            ),
            getWorkflowJobsMockedImplementation(
              readTestResourceAsJSON('workflow_jobs/workflow_jobs.json')
            )
          ),
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records.slice(1)).toMatchSnapshot();
      },
    });
  });

  test('streams - artifacts', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'artifacts/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getRepositoriesMockedImplementation(
              readTestResourceAsJSON('repositories/repositories.json')
            ),
            getWorkflowRunsMockedImplementation(
              readTestResourceAsJSON('workflow_runs/workflow_runs.json')
            ),
            getArtifactsMockedImplementation(
              readTestResourceAsJSON('artifacts/artifacts.json')
            )
          ),
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records.slice(1)).toMatchSnapshot();
      },
    });
  });

  const enterpriseConfig = {
    ...readTestResourceAsJSON('config.json'),
    enterprises: ['github'],
  };

  test('streams - enterprises', async () => {
    await sourceReadTest({
      source,
      configOrPath: enterpriseConfig,
      catalogOrPath: 'enterprises/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          getEnterpriseMockedImplementation(
            readTestResourceAsJSON('enterprises/enterprise.json')
          ),
          logger,
          enterpriseConfig
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - enterprise teams', async () => {
    await sourceReadTest({
      source,
      configOrPath: enterpriseConfig,
      catalogOrPath: 'enterprise_teams/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          getEnterpriseTeamsMockedImplementation(
            readTestResourceAsJSON('enterprise_teams/enterprise_teams.json')
          ),
          logger,
          enterpriseConfig
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - enterprise team memberships', async () => {
    await sourceReadTest({
      source,
      configOrPath: enterpriseConfig,
      catalogOrPath: 'enterprise_team_memberships/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getEnterpriseTeamsMockedImplementation(
              readTestResourceAsJSON('enterprise_teams/enterprise_teams.json')
            ),
            getEnterpriseTeamMembershipsMockedImplementation(
              readTestResourceAsJSON('team_memberships/team_memberships.json')
            )
          ),
          logger,
          enterpriseConfig
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - enterprise copilot seats (empty)', async () => {
    await sourceReadTest({
      source,
      configOrPath: enterpriseConfig,
      catalogOrPath: 'enterprise_copilot_seats/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          getEnterpriseCopilotSeatsMockedImplementation(
            readTestResourceAsJSON('copilot_seats/copilot_seats_empty.json')
          ),
          logger,
          enterpriseConfig
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - enterprise copilot seats', async () => {
    await sourceReadTest({
      source,
      configOrPath: enterpriseConfig,
      catalogOrPath: 'enterprise_copilot_seats/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getEnterpriseCopilotSeatsMockedImplementation(
              readTestResourceAsJSON('copilot_seats/copilot_seats.json')
            )
          ),
          logger,
          enterpriseConfig
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - enterprise copilot usage', async () => {
    await sourceReadTest({
      source,
      configOrPath: enterpriseConfig,
      catalogOrPath: 'enterprise_copilot_usage/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getEnterpriseCopilotMetricsMockedImplementation(
              readTestResourceAsJSON('copilot_usage/copilot_usage_ga.json')
            ),
            getEnterpriseTeamsMockedImplementation(
              readTestResourceAsJSON('enterprise_teams/enterprise_teams.json')
            ),
            getEnterpriseCopilotMetricsForTeamMockedImplementation(
              readTestResourceAsJSON('copilot_usage/copilot_usage_ga.json')
            )
          ),
          logger,
          enterpriseConfig
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - enterprise copilot usage with teams already up-to-date', async () => {
    await sourceReadTest({
      source,
      configOrPath: enterpriseConfig,
      catalogOrPath: 'enterprise_copilot_usage/catalog.json',
      stateOrPath: {
        faros_enterprise_copilot_usage: {
          github: {cutoff: new Date('2024-06-24').getTime()},
        },
      },
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getEnterpriseCopilotMetricsMockedImplementation(
              readTestResourceAsJSON('copilot_usage/copilot_usage_ga.json')
            ),
            getEnterpriseTeamsMockedImplementation(
              readTestResourceAsJSON('enterprise_teams/enterprise_teams.json')
            ),
            getEnterpriseCopilotMetricsForTeamMockedImplementation(
              readTestResourceAsJSON('copilot_usage/copilot_usage_ga.json')
            )
          ),
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toHaveLength(0);
      },
    });
  });

  test('streams - enterprise copilot user usage', async () => {
    await sourceReadTest({
      source,
      configOrPath: enterpriseConfig,
      catalogOrPath: 'enterprise_copilot_user_usage/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          getEnterpriseCopilotUserUsageMockedImplementation(
            readTestResourceAsJSON(
              'enterprise_copilot_user_usage/response.json'
            )
          ),
          logger,
          enterpriseConfig
        );
        getEnterpriseCopilotUserUsageJSONLBlobMockedImplementation(
          readTestResourceFile(
            'enterprise_copilot_user_usage/copilot-usage-report.jsonl'
          )
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - enterprise copilot user usage already up-to-date', async () => {
    await sourceReadTest({
      source,
      configOrPath: enterpriseConfig,
      catalogOrPath: 'enterprise_copilot_user_usage/catalog.json',
      stateOrPath: {
        faros_enterprise_copilot_user_usage: {
          github: {cutoff: new Date('2025-09-01').getTime()},
        },
      },
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          getEnterpriseCopilotUserUsageMockedImplementation(
            readTestResourceAsJSON(
              'enterprise_copilot_user_usage/response.json'
            )
          ),
          logger,
          enterpriseConfig
        );
        getEnterpriseCopilotUserUsageJSONLBlobMockedImplementation(
          readTestResourceFile(
            'enterprise_copilot_user_usage/copilot-usage-report.jsonl'
          )
        );
      },
      checkRecordsData: (records) => {
        expect(records).toHaveLength(0);
      },
    });
  });

  test('streams - enterprise copilot user usage with historical backfill', async () => {
    await sourceReadTest({
      source,
      configOrPath: enterpriseConfig,
      catalogOrPath: 'enterprise_copilot_user_usage/catalog.json',
      stateOrPath: {
        faros_enterprise_copilot_user_usage: {
          github: {cutoff: new Date('2025-07-04').getTime()},
        },
      },
      onBeforeReadResultConsumer: (res) => {
        const mainResponse = readTestResourceAsJSON(
          'enterprise_copilot_user_usage/response.json'
        );
        const dailyResponse = readTestResourceAsJSON(
          'enterprise_copilot_user_usage/daily_response.json'
        );

        // Mock both endpoints
        setupGitHubInstance(
          {
            enterpriseCopilotUserUsage: jest
              .fn()
              .mockReturnValue({data: mainResponse}),
            enterpriseCopilotUserUsageByDay: jest
              .fn()
              .mockReturnValue({data: dailyResponse}),
          },
          logger,
          enterpriseConfig
        );

        // Mock axios calls for download links - called in order: daily, then main
        const dailyReport = readTestResourceFile(
          'enterprise_copilot_user_usage/daily_copilot-usage-report.jsonl'
        );
        const mainReport = readTestResourceFile(
          'enterprise_copilot_user_usage/copilot-usage-report.jsonl'
        );

        const mockAxiosInstance = {
          get: jest
            .fn()
            .mockResolvedValueOnce({data: dailyReport})
            .mockResolvedValueOnce({data: mainReport}),
        };
        jest
          .spyOn(require('faros-js-client'), 'makeAxiosInstanceWithRetry')
          .mockReturnValue(mockAxiosInstance);
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('onBeforeRead with run_mode Custom streams without filtering', async () => {
    await customStreamsTest(
      source,
      readTestResourceAsJSON('config.json'),
      CustomStreamNames
    );
  });

  test('onBeforeRead with run_mode Custom streams with filtering', async () => {
    await customStreamsTest(
      source,
      readTestResourceAsJSON('config.json'),
      CustomStreamNames,
      CustomStreamNames.slice(0, 3)
    );
  });

  test('round robin bucket execution', async () => {
    const config = readTestResourceAsJSON('config.json');
    const catalog = readTestResourceAsJSON('users/catalog.json');
    const {config: newConfig, state: newState} = await source.onBeforeRead(
      {...config, round_robin_bucket_execution: true, bucket_total: 3},
      catalog,
      {__bucket_execution_state: {last_executed_bucket_id: 1}}
    );
    expect(newConfig.bucketing.getBucketId()).toBe(2);
    expect(newState).toMatchSnapshot();
  });
});

const getCopilotSeatsMockedImplementation = (res: any) => ({
  copilot: {
    listCopilotSeats: jest.fn().mockReturnValue(res),
  },
});

const getCopilotUsageForOrgMockedImplementation = (res: any) => ({
  copilot: {
    usageMetricsForOrg: jest.fn().mockReturnValue({data: res}),
  },
});

const getCopilotUsageForTeamMockedImplementation = (res: any) => ({
  copilot: {
    usageMetricsForTeam: jest.fn().mockReturnValue({data: res}),
  },
});

const getCopilotUsageForOrgGAMockedImplementation = (res: any) => ({
  copilotMetrics: jest.fn().mockReturnValue({data: res}),
});

const getCopilotUsageForTeamGAMockedImplementation = (res: any) => ({
  copilotMetricsForTeam: jest.fn().mockReturnValue({data: res}),
});

const getOrganizationMockedImplementation = (res: any) => ({
  orgs: {
    get: jest.fn().mockReturnValue({data: res}),
  },
});

const getRepositoriesMockedImplementation = (res: any) => ({
  repos: {
    listForOrg: jest.fn().mockReturnValue(res),
  },
});

const getPullRequestsMockedImplementation = (res: any) =>
  graphqlMockedImplementation('pullRequests', res);

const getLabelsMockedImplementation = (res: any) =>
  graphqlMockedImplementation('labels', res);

const getPullRequestCommentsMockedImplementation = (res: any) => ({
  pulls: {
    listReviewCommentsForRepo: jest.fn().mockReturnValue(res),
  },
});

const getOrganizationMembersMockedImplementation = (res: any) =>
  graphqlMockedImplementation('listMembers', res);

const getTeamsMockedImplementation = (res: any) => ({
  teams: {
    list: res instanceof Error ? res : jest.fn().mockReturnValue(res),
  },
});

const getTeamMembershipsMockedImplementation = (res: any) => ({
  teams: {
    listMembersInOrg: jest.fn().mockReturnValue(res),
  },
});

const getOrganizationOutsideCollaboratorsMockedImplementation = (res: any) => ({
  orgs: {
    listOutsideCollaborators: jest.fn().mockReturnValue(res),
  },
});

const getOrganizationSamlSsoUsersMockedImplementation = (res: any) =>
  graphqlMockedImplementation('listSamlSsoUsers', res);

const getRepositoryReleasesMockedImplementation = (res: any) => ({
  repos: {
    listReleases: jest.fn().mockReturnValue(res),
  },
});

const getRepositoryLanguagesMockedImplementation = (res: any) => ({
  repos: {
    listLanguages: jest.fn().mockReturnValue({data: res}),
  },
});

const getProjectsMockedImplementation = (res: any) =>
  graphqlMockedImplementation('projects', res);

const getProjectsClassicMockedImplementation = (res: any) => ({
  projects: {
    listForOrg: jest.fn().mockReturnValue(res),
  },
});

const getRepositoryTagsMockedImplementation = (res: any) =>
  graphqlMockedImplementation('repoTags', res);

const getIssuesMockedImplementation = (res: any) =>
  graphqlMockedImplementation('issues', res);

const getIssueCommentsMockedImplementation = (res: any) => ({
  issues: {
    listCommentsForRepo: jest.fn().mockReturnValue(res),
  },
});

const getCodeScanningAlertsMockedImplementation = (res: any) => ({
  codeScanning: {
    listAlertsForRepo: jest.fn().mockReturnValue(res),
  },
});

const getDependabotAlertsMockedImplementation = (res: any) => ({
  dependabot: {
    listAlertsForRepo: jest.fn().mockReturnValue(res),
  },
});

const getSecretScanningAlertsMockedImplementation = (res: any) => ({
  secretScanning: {
    listAlertsForRepo: jest.fn().mockReturnValue(res),
  },
});

const getWorkflowsMockedImplementation = (res: any) => ({
  actions: {
    listRepoWorkflows: jest.fn().mockReturnValue(res.workflows),
  },
});

const getWorkflowRunsMockedImplementation = (res: any) => ({
  actions: {
    listWorkflowRunsForRepo: jest.fn().mockReturnValue(res.workflow_runs),
  },
});

const getWorkflowJobsMockedImplementation = (res: any) => ({
  actions: {
    listJobsForWorkflowRun: jest.fn().mockReturnValue(res.jobs),
  },
});

const getArtifactsMockedImplementation = (res: any) => ({
  actions: {
    listWorkflowRunArtifacts: jest.fn().mockReturnValue(res.artifacts),
  },
});

const getListCommitStatusesForRefMockedImplementation = (res: any) => ({
  repos: {
    listCommitStatusesForRef: jest.fn().mockReturnValue(res),
  },
});

const getEnterpriseMockedImplementation = (res: any) =>
  graphqlMockedImplementation('enterprise', res);

const getEnterpriseTeamsMockedImplementation = (res: any) => ({
  enterpriseTeams: jest.fn().mockReturnValue(res),
});

const getEnterpriseTeamMembershipsMockedImplementation = (res: any) => ({
  enterpriseTeamMembers: jest.fn().mockReturnValue(res),
});

const getEnterpriseCopilotSeatsMockedImplementation = (res: any) => ({
  enterpriseCopilotSeats: jest.fn().mockReturnValue(res),
});

const getEnterpriseCopilotMetricsMockedImplementation = (res: any) => ({
  enterpriseCopilotMetrics: jest.fn().mockReturnValue({data: res}),
});

const getEnterpriseCopilotMetricsForTeamMockedImplementation = (res: any) => ({
  enterpriseCopilotMetricsForTeam: jest.fn().mockReturnValue({data: res}),
});

const getEnterpriseCopilotUserUsageMockedImplementation = (res: any) => ({
  enterpriseCopilotUserUsage: jest.fn().mockReturnValue({data: res}),
});

const getEnterpriseCopilotUserUsageJSONLBlobMockedImplementation = (
  res: any
) => {
  const mockAxiosInstance = {
    get: jest.fn().mockResolvedValue({data: res}),
  };
  jest
    .spyOn(require('faros-js-client'), 'makeAxiosInstanceWithRetry')
    .mockReturnValue(mockAxiosInstance);
};
