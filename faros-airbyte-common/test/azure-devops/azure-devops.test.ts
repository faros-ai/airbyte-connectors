import {AirbyteLogLevel, AirbyteSourceLogger} from 'faros-airbyte-cdk';

import {AzureDevOps} from '../../src/azure-devops/azure-devops';
import {AzureDevOpsConfig} from '../../src/azure-devops/types';

jest.mock('azure-devops-node-api');

describe('client', () => {
  class TestAzureDevOps extends AzureDevOps {}

  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.INFO
  );

  beforeEach(() => {
    (AzureDevOps as any).azureDevOps = null;
  });

  test('valid config for azure devops services (cloud)', async () => {
    const config = {
      access_token: 'access_token',
      organization: 'organization',
      instance: {
        type: 'cloud',
      },
    } as AzureDevOpsConfig;

    const azureDevOps = await TestAzureDevOps.instance(config, logger);
    expect(azureDevOps).toBeInstanceOf(AzureDevOps);
  });

  test('valid config for azure devops server', async () => {
    const config = {
      access_token: 'access_token',
      organization: 'organization',
      instance: {
        type: 'server',
        api_url: 'https://my-server.com',
      },
    } as AzureDevOpsConfig;

    const azureDevOps = await TestAzureDevOps.instance(config, logger);
    expect(azureDevOps).toBeInstanceOf(AzureDevOps);
  });

  test('missing access_token in config', async () => {
    const config = {
      access_token: null,
      organization: 'organization',
    };
    await expect(TestAzureDevOps.instance(config, logger)).rejects.toThrow(
      'access_token must not be an empty string'
    );
  });

  test('missing organization in config', async () => {
    const config = {
      access_token: 'access_token',
      organization: null,
    };
    await expect(TestAzureDevOps.instance(config, logger)).rejects.toThrow(
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
      },
    } as AzureDevOpsConfig;
    await expect(TestAzureDevOps.instance(config, logger)).rejects.toThrow(
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
      },
    } as AzureDevOpsConfig;
    await expect(TestAzureDevOps.instance(config, logger)).rejects.toThrow(
      'Invalid URL: invalid_api_url'
    );
  });
});
