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
  const source = new sut.GithubSource(logger);

  test('check connection - token valid', async () => {
    // TODO: mock API call
    const source = new sut.GithubSource(logger);
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
    // TODO: mock API call
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
    // TODO: mock API call
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
});
