import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '../testing-tools';
import {destinationWriteTest} from './utils';

describe('circleci', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  let configPath: string;

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({
      api_url: mockttp.url,
      source_specific_configs: {circleci: {skip_writing_test_cases: false}},
    });
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/circleci/catalog.json',
      inputRecordsPath: 'circleci/all-streams.log',
    });
  });
});
