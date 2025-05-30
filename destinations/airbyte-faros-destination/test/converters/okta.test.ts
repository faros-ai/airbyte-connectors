import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '@faros-ai/airbyte-testing-tools';
import {destinationWriteTest} from '@faros-ai/airbyte-testing-tools';

describe('okta', () => {
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
      catalogPath: 'test/resources/okta/catalog.json',
      inputRecordsPath: 'okta/all-streams.log',
      checkRecordsData: (records) => expect(records).toMatchSnapshot(),
    });
  });
});
