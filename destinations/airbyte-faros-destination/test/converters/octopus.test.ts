import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '../testing-tools';
import {octopusAllStreamsLog} from './data';
import {destinationWriteTest} from './utils';

describe('octopus', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/octopus/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__octopus__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({
      api_url: mockttp.url,
    });
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const expectedProcessedByStream = {
      deployments: 6,
      releases: 6,
    };
    const expectedWrittenByModel = {
      cicd_Deployment: 6,
      cicd_Release: 6,
    };

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: octopusAllStreamsLog,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
    });
  });
});
