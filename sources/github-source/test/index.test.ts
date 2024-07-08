import {
  AirbyteLogger,
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

  test('streams - copilot seats', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'copilot_seats/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          getCopilotSeatsMockedImplementation(
            readTestResourceAsJSON('copilot_seats/copilot_seats.json')
          )
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
          )
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
          )
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
          getOrganizationsMockedImplementation(
            readTestResourceAsJSON('organizations/organization.json')
          )
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
          )
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
          )
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
          )
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
          )
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });
});

function setupGitHubInstance(octokitMock: any) {
  GitHub.instance = jest.fn().mockImplementation(() => {
    return new GitHubToken(
      readTestResourceAsJSON('config.json'),
      {
        ...octokitMock,
        paginate: {
          iterator: (fn: () => any) => iterate([{data: fn()}]),
        },
        orgs: {
          ...octokitMock.orgs,
          listForAuthenticatedUser: jest
            .fn()
            .mockReturnValue([{login: 'github'}]),
        },
      },
      new AirbyteLogger()
    );
  });
}

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

const getOrganizationsMockedImplementation = (res: any) => ({
  orgs: {
    get: jest.fn().mockReturnValue({data: res}),
  },
});

const getRepositoriesMockedImplementation = (res: any) => ({
  repos: {
    listForOrg: jest.fn().mockReturnValue(res),
  },
});

const getOrganizationMembersMockedImplementation = (res: any) => ({
  graphql: {
    paginate: {
      iterator: jest.fn().mockImplementation((query: string) => {
        if (!query.includes('listMembers')) {
          throw new Error('Not mocked');
        }
        return iterate([res]);
      }),
    },
  },
});

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

async function* iterate<T>(arr: ReadonlyArray<T>): AsyncIterableIterator<T> {
  for (const x of arr) {
    yield x;
  }
}
