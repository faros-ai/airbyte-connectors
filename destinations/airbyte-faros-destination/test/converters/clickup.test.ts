import {getLocal} from 'mockttp';

import {initMockttp, sourceSpecificTempConfig} from '@faros-ai/airbyte-testing-tools';
import {destinationWriteTest} from '@faros-ai/airbyte-testing-tools';

describe('clickup', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  let configPath: string;

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await sourceSpecificTempConfig(mockttp.url, {
      clickup: {taskboard_source: 'space'},
    });
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/clickup/catalog.json',
      inputRecordsPath: 'clickup/all-streams.log',
    });
  });
});
