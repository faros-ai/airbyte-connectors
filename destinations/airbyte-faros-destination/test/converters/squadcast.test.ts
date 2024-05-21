import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '../testing-tools';
import {squadcastAllStreamsLog} from './data';
import {destinationWriteTest} from './utils';

describe('squadcast', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/squadcast/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__squadcast__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({api_url: mockttp.url});
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const expectedProcessedByStream = {
      events: 3,
      incidents: 4,
      services: 1,
      users: 1,
    };
    const expectedWrittenByModel = {
      compute_Application: 1,
      ims_Incident: 4,
      ims_IncidentApplicationImpact: 4,
      ims_IncidentEvent: 3,
      ims_IncidentTag: 3,
      ims_Label: 3,
      ims_User: 1,
    };

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: squadcastAllStreamsLog,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
    });
  });
});
