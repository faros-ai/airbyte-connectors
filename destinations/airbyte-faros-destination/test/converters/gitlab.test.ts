import {getLocal} from 'mockttp';

import {
  initMockttp,
  tempConfig,
} from '../testing-tools';
import {destinationWriteTest} from './utils';

describe('gitlab', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  let configPath: string;

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({api_url: mockttp.url});
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/gitlab/catalog.json',
      inputRecordsPath: 'gitlab/all-streams.log',
    });
  });
});
