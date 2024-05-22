import _ from 'lodash';
import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '../testing-tools';
import {azureactivedirectoryAllStreamsLog} from './data';
import {destinationWriteTest} from './utils';

describe('azureactivedirectory', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/azureactivedirectory/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__azureactivedirectory__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({api_url: mockttp.url});
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const expectedProcessedByStream = {
      groups: 1,
      users: 2,
    };
    const expectedWrittenByModel = {
      geo_Address: 1,
      geo_Location: 1,
      identity_Identity: 2,
      org_Department: 1,
      org_Employee: 2,
      org_Team: 1,
      org_TeamMembership: 2,
    };

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: azureactivedirectoryAllStreamsLog,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
    });
  });
});
