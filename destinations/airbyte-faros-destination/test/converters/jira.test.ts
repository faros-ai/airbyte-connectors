import {
  AirbyteConnectionStatus,
  AirbyteConnectionStatusMessage,
} from 'faros-airbyte-cdk';
import {getLocal} from 'mockttp';
import os from 'os';

import {CLI, read, initMockttp, tempConfig, destinationWriteTest} from '@faros-ai/airbyte-testing-tools';

describe('jira', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  let configPath: string;

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({
      api_url: mockttp.url,
      edition_configs: {},
      source_specific_configs: {
        jira: {
          truncate_limit: 1000,
        },
      },
    });
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('check valid jira source config', async () => {
    const cli = await CLI.runWith(['check', '--config', configPath]);

    expect(await read(cli.stderr)).toBe('');
    expect(await read(cli.stdout)).toBe(
      JSON.stringify(
        new AirbyteConnectionStatusMessage({
          status: AirbyteConnectionStatus.SUCCEEDED,
        })
      ) + os.EOL
    );
    expect(await cli.wait()).toBe(0);
  });

  test('process records from all streams', async () => {
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/jira/catalog.json',
      inputRecordsPath: 'jira/all-streams.log',
    });
  });
});
