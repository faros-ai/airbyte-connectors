import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  sourceCheckTest,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';

import {GitHub} from '../src/github';
import * as sut from '../src/index';
import {GitHubConfig} from '../src/types';

function readResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
}

function readTestResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
}

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const source = new sut.GitHubSource(logger);
  const config = readTestResourceFile('config.json');

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

  const testStream = async (
    streamName: string,
    sourceConfig: GitHubConfig,
    octokitMock?: any,
    streamSlice?: any,
    farosClientMock?: any,
    // only use if we do not want to write data snapshot
    expectedResultLength?: number
  ) => {
    setupGitHubInstance(octokitMock, sourceConfig, logger);

    const source = new sut.GitHubSource(logger);
    if (farosClientMock) {
      jest
        .spyOn(source, 'makeFarosClient')
        .mockImplementation(() => farosClientMock);
    }
    const streams = source.streams({
      ...sourceConfig,
      ...(farosClientMock && {api_key: 'faros-api-key'}),
    });
    const stream = streams.find((s) => s.name === streamName);
    const iter = stream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      streamSlice,
      {}
    );

    const items = [];
    for await (const item of iter) {
      items.push(item);
    }
    if (!expectedResultLength) {
      expect(items).toMatchSnapshot();
    } else {
      expect(items).toHaveLength(expectedResultLength);
    }
  };

  test('streams - copilot seats', async () => {
    await testStream(
      'faros_copilot_seats',
      config,
      {
        copilot: {
          listCopilotSeats: jest
            .fn()
            .mockReturnValue(readTestResourceFile('copilot_seats.json')),
        },
      },
      {org: 'faros-ai'}
    );
  });

  test('streams - copilot seats with inactive seats inference using faros graph', async () => {
    await testStream(
      'faros_copilot_seats',
      config,
      {
        copilot: {
          listCopilotSeats: jest
            .fn()
            .mockReturnValue(readTestResourceFile('copilot_seats_empty.json')),
        },
      },
      {org: 'faros-ai'},
      {
        nodeIterable: jest
          .fn()
          .mockReturnValue(iterate(readTestResourceFile('vcs_user_tool.json'))),
      }
    );
  });
});

function setupGitHubInstance(
  octokitMock: any,
  sourceConfig: GitHubConfig,
  logger: AirbyteLogger
) {
  GitHub.instance = jest.fn().mockImplementation(() => {
    return new GitHub(
      {
        paginate: {
          iterator: (fn: () => any) => iterate([{data: fn()}]),
        },
        ...octokitMock,
      },
      sourceConfig.authentication.auth,
      logger
    );
  });
}

async function* iterate<T>(arr: ReadonlyArray<T>): AsyncIterableIterator<T> {
  for (const x of arr) {
    yield x;
  }
}
