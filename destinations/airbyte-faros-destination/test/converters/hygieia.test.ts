import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '../testing-tools';
import {hygieiaAllStreamsLog} from './data';
import {destinationWriteTest} from './utils';

describe('hygieia', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/hygieia/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__hygieia__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({api_url: mockttp.url});
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const expectedProcessedByStream = {
      collector_items: 1,
    };
    const expectedWrittenByModel = {
      cicd_Organization: 1,
      cicd_Pipeline: 1,
    };

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: hygieiaAllStreamsLog,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
    });
  });
});
