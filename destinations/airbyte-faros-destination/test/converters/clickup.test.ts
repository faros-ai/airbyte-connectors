import {
import {destinationWriteTest} from 'faros-airbyte-testing-tools';
  initMockttp,
  sourceSpecificTempConfig,
} from 'faros-airbyte-testing-tools';
import {getLocal} from 'mockttp';

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
