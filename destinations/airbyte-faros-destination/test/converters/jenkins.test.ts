import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '../../src/testing-tools/testing-tools';
import { generateBasicTestSuite, destinationWriteTest } from '../../src/testing-tools/utils';

generateBasicTestSuite({sourceName: 'jenkins'});

describe('jenkins', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  let configPath: string;

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({api_url: mockttp.url});
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams with commits', async () => {
    configPath = await tempConfig({
      api_url: mockttp.url,
      source_specific_configs: {
        jenkins: {
          create_commit_records: true,
        },
      },
    });

    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/jenkins/catalog.json',
      inputRecordsPath: 'jenkins/all-streams.log',
    });
  });
});
