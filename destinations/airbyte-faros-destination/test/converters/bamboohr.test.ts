import _ from 'lodash';
import {getLocal} from 'mockttp';

import {Edition, InvalidRecordStrategy} from '../../src';
import {initMockttp, tempConfig} from '../testing-tools';
import {bamboohrAllStreamsLog} from './data';
import {destinationWriteTest} from './utils';

describe('bamboohr', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/bamboohr/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__bamboohr__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({
      api_url: mockttp.url,
      invalid_record_strategy: InvalidRecordStrategy.SKIP,
      edition: Edition.CLOUD,
      edition_configs: {},
      source_specific_configs: {
        bamboohr: {
          bootstrap_teams_from_managers: true,
          inactive_employment_history_status: ['Terminated', 'On-Leave'],
        },
      },
    });
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const expectedProcessedByStream = {
      users: 87,
    };
    const expectedWrittenByModel = {
      geo_Address: 87,
      geo_Location: 87,
      identity_Identity: 87,
      org_Department: 9,
      org_Employee: 87,
      org_Team: 26,
      org_TeamMembership: 110,
    };

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: bamboohrAllStreamsLog,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
    });
  });
});
