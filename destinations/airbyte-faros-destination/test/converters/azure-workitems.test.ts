import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '../testing-tools';
import {destinationWriteTest} from './utils';

describe('azure-workitems', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});

  beforeEach(async () => {
    await initMockttp(mockttp);
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    await destinationWriteTest({
      configPath: await tempConfig({api_url: mockttp.url, log_records: true}),
      catalogPath: 'test/resources/azure-workitems/catalog.json',
      inputRecordsPath: 'azure-workitems/all-streams.log',
      checkRecordsData: (records) => expect(records).toMatchSnapshot(),
    });
  });
});
