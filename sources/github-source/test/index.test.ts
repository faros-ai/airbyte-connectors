import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  readTestResourceAsJSON,
  sourceCheckTest,
  sourceReadTest,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {merge} from 'lodash';

import {GitHub, GitHubApp, GitHubToken} from '../src/github';
import * as sut from '../src/index';
import {graphqlMockedImplementation, setupGitHubInstance} from './utils';

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

  test('streams - copilot seats', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'copilot_seats/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          getCopilotSeatsMockedImplementation(
            readTestResourceAsJSON('copilot_seats/copilot_seats.json')
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

  test('streams - copilot usage', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'copilot_usage/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          getCopilotUsageMockedImplementation(
            readTestResourceAsJSON('copilot_usage/copilot_usage.json')
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
});

const getCopilotSeatsMockedImplementation = (res: any) => ({
  copilot: {
    listCopilotSeats: jest.fn().mockReturnValue(res),
  },
});

const getCopilotUsageMockedImplementation = (res: any) => ({
  copilot: {
    usageMetricsForOrg: jest.fn().mockReturnValue({data: res}),
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

const getOrganizationMembersMockedImplementation = (res: any) =>
  graphqlMockedImplementation('listMembers', res);

const getTeamsMockedImplementation = (res: any) => ({
  teams: {
    list: jest.fn().mockReturnValue(res),
  },
});

const getTeamMembershipsMockedImplementation = (res: any) => ({
  teams: {
    listMembersInOrg: jest.fn().mockReturnValue(res),
  },
});

const getCommitsMockedImplementation = (res: any) =>
  graphqlMockedImplementation('commits', res);
