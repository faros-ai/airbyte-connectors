import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  sourceCheckTest,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';

import {GitHub} from '../src/github';
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

  afterEach(() => {
    jest.resetAllMocks();
    (GitHub as any).github = undefined;
  });

  test('spec', async () => {
    const source = new sut.GitHubSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection - token valid', async () => {
    const source = new sut.GitHubSource(logger);
    checkConnectionMock();
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/token_valid.json',
    });
  });

  test('check connection - token missing', async () => {
    const source = new sut.GitHubSource(logger);
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/token_invalid.json',
    });
  });

  test('check connection - app invalid', async () => {
    const source = new sut.GitHubSource(logger);
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/app_invalid.json',
    });
  });

  test('check connection - app auth missing', async () => {
    const source = new sut.GitHubSource(logger);
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/app_auth_missing.json',
    });
  });

  test('check connection - app client invalid', async () => {
    const source = new sut.GitHubSource(logger);
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/app_client_invalid.json',
    });
  });

  test('check connection - app client valid', async () => {
    const source = new sut.GitHubSource(logger);
    checkConnectionMock();
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/app_client_valid.json',
    });
  });

  test('check connection - app installation invalid', async () => {
    const source = new sut.GitHubSource(logger);
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/app_installation_invalid.json',
    });
  });

  test('check connection - app installation valid', async () => {
    const source = new sut.GitHubSource(logger);
    checkConnectionMock();
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/app_installation_valid.json',
    });
  });

  test('check connection - authentication missing', async () => {
    const source = new sut.GitHubSource(logger);
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/authentication_missing.json',
    });
  });

  function checkConnectionMock() {
    jest.spyOn(GitHub.prototype, 'checkConnection').mockResolvedValue();
  }
});
