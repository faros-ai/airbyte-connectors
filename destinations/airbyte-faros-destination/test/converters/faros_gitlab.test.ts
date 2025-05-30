import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '@faros-ai/airbyte-testing-tools';
import {destinationWriteTest} from '@faros-ai/airbyte-testing-tools';

describe('faros_gitlab', () => {
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
    jest.restoreAllMocks();
  });

  test('process records from all streams', async () => {
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/faros_gitlab/catalog.json',
      inputRecordsPath: 'faros_gitlab/all-streams.log',
      checkRecordsData: (records) => expect(records).toMatchSnapshot(),
    });
  });
});
