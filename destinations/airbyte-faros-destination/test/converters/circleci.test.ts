import {
  destinationWriteTest,
  initMockttp,
  tempConfig,
} from 'faros-airbyte-testing-tools';
import {readFileSync} from 'fs';
import {getLocal} from 'mockttp';
import * as zlib from 'zlib';

describe('circleci', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  let configPath: string;

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({
      api_url: mockttp.url,
      log_records: true,
      source_specific_configs: {circleci: {skip_writing_test_cases: false}},
    });
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    // Load CSV data from file
    const csvData = readFileSync(
      'test/resources/circleci/usage-export.csv',
      'utf8'
    );

    // Compress the CSV data
    const compressedCsv = zlib.gzipSync(Buffer.from(csvData));

    // Mock the CSV download endpoint - now using relative path
    await mockttp.forGet('/usage-export.csv.gz').thenReply(200, compressedCsv, {
      'content-type': 'application/gzip',
    });

    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/circleci/catalog.json',
      inputRecordsPath: 'circleci/all-streams.log',
      checkRecordsData: (records) => expect(records).toMatchSnapshot(),
    });
  });
});
