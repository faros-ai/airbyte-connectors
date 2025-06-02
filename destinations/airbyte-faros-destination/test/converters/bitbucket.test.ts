import {getLocal} from 'mockttp';
import {destinationWriteTest, initMockttp, tempConfig} from 'faros-airbyte-testing-tools';

describe('bitbucket', () => {
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
      catalogPath: 'test/resources/bitbucket/catalog.json',
      inputRecordsPath: 'bitbucket/all-streams.log',
      checkRecordsData: (records) => expect(records).toMatchSnapshot(),
    });
  });

  describe('pull_requests_with_activities', () => {
    test('pull_requests_with_activities', async () => {
      await destinationWriteTest({
        configPath,
        catalogPath: 'test/resources/bitbucket/catalog.json',
        inputRecordsPath: 'bitbucket/pull_requests_with_activities.log',
        checkRecordsData: (records) => expect(records).toMatchSnapshot(),
      });
    });

    test('diff stats', async () => {
      await destinationWriteTest({
        configPath,
        catalogPath: 'test/resources/bitbucket/catalog.json',
        inputRecordsPath: 'bitbucket/pull_requests_diff_stats.log',
        checkRecordsData: (records) => expect(records).toMatchSnapshot(),
      });
    });
  });
});
