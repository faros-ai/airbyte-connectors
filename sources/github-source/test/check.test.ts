import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  sourceCheckTest,
} from 'faros-airbyte-cdk';

import * as sut from '../src/index';

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );
  const source = new sut.GitHubSource(logger);

  async function runSourceCheckTest(configOrPath: string): Promise<void> {
    return sourceCheckTest({
      source,
      configOrPath,
    });
  }

  test('check connection - token valid', async () => {
    // TODO: mock API call
    await runSourceCheckTest('check_connection/token_valid.json');
  });

  test('check connection - token missing', async () => {
    await runSourceCheckTest('check_connection/token_invalid.json');
  });

  test('check connection - app invalid', async () => {
    await runSourceCheckTest('check_connection/app_invalid.json');
  });

  test('check connection - app auth missing', async () => {
    await runSourceCheckTest('check_connection/app_auth_missing.json');
  });

  test('check connection - app client invalid', async () => {
    await runSourceCheckTest('check_connection/app_client_invalid.json');
  });

  test('check connection - app client valid', async () => {
    // TODO: mock API call
    await runSourceCheckTest('check_connection/app_client_valid.json');
  });

  test('check connection - app installation invalid', async () => {
    await runSourceCheckTest('check_connection/app_installation_invalid.json');
  });

  test('check connection - app installation valid', async () => {
    // TODO: mock API call
    await runSourceCheckTest('check_connection/app_installation_valid.json');
  });

  test('check connection - authentication missing', async () => {
    await runSourceCheckTest('check_connection/authentication_missing.json');
  });
});
