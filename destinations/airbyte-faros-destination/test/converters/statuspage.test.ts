import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '../testing-tools';
import {statuspageAllStreamsLog} from './data';
import {destinationWriteTest} from './utils';

describe('statuspage', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/statuspage/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__statuspage__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({api_url: mockttp.url});
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const expectedProcessedByStream = {
      component_groups: 3,
      components: 9,
      incidents: 5,
      pages: 1,
      users: 1,
      component_uptimes: 5,
    };
    const expectedWrittenByModel = {
      compute_Application: 6,
      ims_ApplicationUptime: 5,
      ims_Incident: 5,
      ims_IncidentApplicationImpact: 7,
      ims_IncidentEvent: 14,
      ims_User: 1,
    };

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: statuspageAllStreamsLog,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
    });
  });
});
