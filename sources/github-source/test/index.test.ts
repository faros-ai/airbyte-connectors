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

import {GitHub} from '../src/github';
import * as sut from '../src/index';
import {GitHubConfig} from '../src/types';

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
    jest.spyOn(GitHub.prototype, 'checkConnection').mockResolvedValue();
  }

  test('check connection - token valid', async () => {
    checkConnectionMock();
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/token_valid.json',
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

  test('check connection - app auth missing', async () => {
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/app_auth_missing.json',
    });
  });

  test('check connection - app client invalid', async () => {
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/app_client_invalid.json',
    });
  });

  test('check connection - app client valid', async () => {
    checkConnectionMock();
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/app_client_valid.json',
    });
  });

  test('check connection - app installation invalid', async () => {
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/app_installation_invalid.json',
    });
  });

  test('check connection - app installation valid', async () => {
    checkConnectionMock();
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/app_installation_valid.json',
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
          ),
          res.config as GitHubConfig
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - copilot seats with inactive seats inference using faros graph', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'copilot_seats/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGitHubInstance(
          getCopilotSeatsMockedImplementation(
            readTestResourceAsJSON('copilot_seats/copilot_seats_empty.json')
          ),
          res.config as GitHubConfig
        );
        setupFarosClientMock(
          {
            nodeIterable: jest
              .fn()
              .mockReturnValue(
                iterate(
                  readTestResourceAsJSON('copilot_seats/vcs_user_tool.json')
                )
              ),
          },
          res.config as GitHubConfig
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
          res.config as GitHubConfig
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });
});

function setupGitHubInstance(octokitMock: any, sourceConfig: GitHubConfig) {
  GitHub.instance = jest.fn().mockImplementation(() => {
    return new GitHub(
      {
        paginate: {
          iterator: (fn: () => any) => iterate([{data: fn()}]),
        },
        orgs: {
          listForAuthenticatedUser: jest
            .fn()
            .mockReturnValue([{login: 'faros-ai'}]),
        },
        ...octokitMock,
      },
      sourceConfig.authentication.auth,
      new AirbyteLogger()
    );
  });
}

function setupFarosClientMock(
  farosClientMock: any,
  sourceConfig: GitHubConfig
) {
  (sourceConfig as any).api_key = 'faros-api-key';
  jest
    .spyOn(sut.GitHubSource.prototype, 'makeFarosClient')
    .mockImplementation(() => farosClientMock);
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

async function* iterate<T>(arr: ReadonlyArray<T>): AsyncIterableIterator<T> {
  for (const x of arr) {
    yield x;
  }
}
