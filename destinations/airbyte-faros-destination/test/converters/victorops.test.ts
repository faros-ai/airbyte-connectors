import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '../testing-tools';
import {victoropsAllStreamsLog} from './data';
import {destinationWriteTest} from './utils';

describe('victorops', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/victorops/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__victorops__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({api_url: mockttp.url});
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const expectedProcessedByStream = {
      incidents: 2,
      teams: 2,
      users: 1,
    };
    const expectedWrittenByModel = {
      compute_Application: 2,
      ims_Incident: 2,
      ims_IncidentApplicationImpact: 2,
      ims_IncidentAssignment: 2,
      ims_IncidentEvent: 4,
      ims_Team: 2,
      ims_TeamIncidentAssociation: 2,
      ims_User: 1,
    };

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: victoropsAllStreamsLog,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
    });
  });
});
