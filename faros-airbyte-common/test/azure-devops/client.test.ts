import {AirbyteLogLevel, AirbyteSourceLogger} from 'faros-airbyte-cdk';

import {AzureDevOps} from '../../src/azure-devops/azure-devops';
import {DevOpsCloud, DevOpsServer} from '../../src/azure-devops/types';

describe('client', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.INFO
  );

  beforeEach(() => {
    jest.resetAllMocks();
  });

  // TODO: This test is failing because the WebApi constructor is not being mocked correctly.
  test('valid config for azure devops services (cloud)', async () => {
    const {AzureDevOps} = await import('../../src/azure-devops/azure-devops');
    const config = {
      access_token: 'access_token',
      organization: 'organization',
      instance: {
        type: 'cloud',
      } as DevOpsCloud,
    };

    await AzureDevOps.instance(config, logger);
  });

  test('valid config for azure devops server', async () => {
    const {AzureDevOps} = await import('../../src/azure-devops/azure-devops');
    const config = {
      access_token: 'access_token',
      organization: 'organization',
      instance: {
        type: 'server',
        api_url: 'https://my-server.com',
      } as DevOpsServer,
    };

    await AzureDevOps.instance(config, logger);
  });

  test('missing access_token in config', async () => {
    const config = {
      access_token: null,
      organization: 'organization',
    };
    await expect(AzureDevOps.instance(config, logger)).rejects.toThrow(
      'access_token must not be an empty string'
    );
  });

  test('missing organization in config', async () => {
    const config = {
      access_token: 'access_token',
      organization: null,
    };
    await expect(AzureDevOps.instance(config, logger)).rejects.toThrow(
      'organization must not be an empty string'
    );
  });

  test('missing api url for server instance', async () => {
    const config = {
      access_token: 'access_token',
      organization: 'organization',
      instance: {
        type: 'server',
        api_url: null,
      } as DevOpsServer,
    };
    await expect(AzureDevOps.instance(config, logger)).rejects.toThrow(
      'api_url must not be an empty string for server instance type'
    );
  });

  test('invalid api url for server instance', async () => {
    const config = {
      access_token: 'access_token',
      organization: 'organization',
      instance: {
        type: 'server',
        api_url: 'invalid_api_url',
      } as DevOpsServer,
    };
    await expect(AzureDevOps.instance(config, logger)).rejects.toThrow(
      'Invalid URL: invalid_api_url'
    );
  });
});
