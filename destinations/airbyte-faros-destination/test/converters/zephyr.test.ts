import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '../../src/testing-tools/testing-tools';
import {destinationWriteTest} from '../../src/testing-tools/utils';

describe('zephyr', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  let configPath: string;
  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({
      api_url: mockttp.url,
      log_records: true,
    });
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/zephyr/catalog.json',
      inputRecordsPath: 'zephyr/all-streams.log',
      checkRecordsData: (records) => expect(records).toMatchSnapshot(),
    });
  });
});
