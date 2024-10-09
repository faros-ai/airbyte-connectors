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
import {merge} from 'lodash';

import {GitHub, GitHubApp, GitHubToken} from '../src/github';
import * as sut from '../src/index';
import {OrgRepoFilter} from '../src/org-repo-filter';
import {
  ErrorWithStatus,
  graphqlMockedImplementation,
  setupGitHubInstance,
} from './utils';

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

  const source = new sut.GitHubSource(logger);

  afterEach(() => {
    jest.resetAllMocks();
    (GitHub as any).github = undefined;
    (OrgRepoFilter as any)._instance = undefined;
  });

  test('spec', async () => {
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  function checkConnectionMock() {
    jest.spyOn(GitHubToken.prototype, 'checkConnection').mockResolvedValue();
    jest.spyOn(GitHubApp.prototype, 'checkConnection').mockResolvedValue();
    jest
      .spyOn(GitHubApp.prototype as any, 'getAppInstallations')
      .mockResolvedValue([]);
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

  test('streams - copilot seats without audit logs API', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'copilot_seats/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getCopilotSeatsMockedImplementation(
              readTestResourceAsJSON('copilot_seats/copilot_seats.json')
            ),
            getTeamAddMemberAuditLogsMockedImplementation(
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

  test('streams - copilot seats with audit logs API', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'copilot_seats/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getCopilotSeatsMockedImplementation(
              readTestResourceAsJSON('copilot_seats/copilot_seats.json')
            ),
            getTeamAddMemberAuditLogsMockedImplementation(
              readTestResourceAsJSON(
                'copilot_seats/team_add_member_audit_logs.json'
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

  test('streams - copilot usage without teams', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'copilot_usage/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getCopilotUsageForOrgMockedImplementation(
              readTestResourceAsJSON('copilot_usage/copilot_usage.json')
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

  test('streams - copilot usage with teams', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'copilot_usage/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getCopilotUsageForOrgMockedImplementation(
              readTestResourceAsJSON('copilot_usage/copilot_usage.json')
            ),
            getTeamsMockedImplementation(
              readTestResourceAsJSON('teams/teams.json')
            ),
            getCopilotUsageForTeamMockedImplementation(
              readTestResourceAsJSON('copilot_usage/copilot_usage.json')
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

  test('streams - pull requests', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'pull_requests/catalog.json',
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
            getCommitsMockedImplementation(
              readTestResourceAsJSON('commits/commits.json')
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

  test('streams - contributors stats', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'contributors_stats/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          merge(
            getRepositoriesMockedImplementation(
              readTestResourceAsJSON('repositories/repositories.json')
            ),
            getContributorsStatsMockedImplementation(
              readTestResourceAsJSON(
                'contributors_stats/contributors_stats.json'
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
});

const getCopilotSeatsMockedImplementation = (res: any) => ({
  copilot: {
    listCopilotSeats: jest.fn().mockReturnValue(res),
  },
});

const getTeamAddMemberAuditLogsMockedImplementation = (res: any) => ({
  auditLogs: res instanceof Error ? res : jest.fn().mockReturnValue(res),
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

const getContributorsStatsMockedImplementation = (res: any) => ({
  repos: {
    getContributorsStats: jest.fn().mockReturnValue({data: res}),
  },
});

const getProjectsMockedImplementation = (res: any) =>
  graphqlMockedImplementation('projects', res);

const getProjectsClassicMockedImplementation = (res: any) => ({
  projects: {
    listForOrg: jest.fn().mockReturnValue(res),
  },
});

const getCommitsMockedImplementation = (res: any) =>
  graphqlMockedImplementation('commits', res);

const getRepositoryTagsMockedImplementation = (res: any) =>
  graphqlMockedImplementation('repoTags', res);

const getIssuesMockedImplementation = (res: any) =>
  graphqlMockedImplementation('issues', res);

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
    listRepoWorkflows: jest.fn().mockReturnValue(res),
  },
});

const getWorkflowRunsMockedImplementation = (res: any) => ({
  actions: {
    listWorkflowRunsForRepo: jest.fn().mockReturnValue(res),
  },
});
