import _ from 'lodash';
import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '../testing-tools';
import {agileacceleratorAllStreamsLog} from './data';
import {destinationWriteTest} from './utils';

describe('agileaccelerator', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/agileaccelerator/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__agileaccelerator__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({api_url: mockttp.url});
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const expectedProcessedByStream = {
      works: 11,
    };
    const expectedWrittenByModel = {
      tms_Epic: 9,
      tms_Project: 9,
      tms_Sprint: 6,
      tms_Task: 11,
      tms_User: 1,
    };

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: agileacceleratorAllStreamsLog,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
    });
  });
});
