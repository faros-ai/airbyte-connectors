import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '../testing-tools';
import {harnessAllStreamsLog} from './data';
import {destinationWriteTest} from './utils';

describe('harness', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/harness/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__harness__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({api_url: mockttp.url});
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const expectedProcessedByStream = {
      executions: 2,
    };
    const expectedWrittenByModel = {
      cicd_Build: 1,
      cicd_Deployment: 2,
      compute_Application: 2,
    };

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: harnessAllStreamsLog,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
    });
  });
});
