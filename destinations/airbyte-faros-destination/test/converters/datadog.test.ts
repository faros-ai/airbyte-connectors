import {getLocal} from 'mockttp';
import {destinationWriteTest, initMockttp, tempConfig} from 'faros-airbyte-testing-tools';

describe('datadog', () => {
  const mockttp = getLocal({debug: false, recordTraffic: true});
  let configPath: string;

  beforeEach(async () => {
    await initMockttp(mockttp);

    configPath = await tempConfig({
      api_url: mockttp.url,
      log_records: true,
      source_specific_configs: {
        datadog: {
          application_mapping:
            '{"service1": {"name": "Service 1","platform":"test"}}',
        },
      },
    });
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/datadog/catalog.json',
      inputRecordsPath: 'datadog/all-streams.log',
      checkRecordsData: (records) => expect(records).toMatchSnapshot(),
    });
  });
});
