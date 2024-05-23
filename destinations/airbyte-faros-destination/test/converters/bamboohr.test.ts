import {getLocal} from 'mockttp';

import {Edition, InvalidRecordStrategy} from '../../src';
import {initMockttp, tempConfig} from '../testing-tools';
import {destinationWriteTest} from './utils';

describe('bamboohr', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/bamboohr/catalog.json';
  let configPath: string;

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
    await destinationWriteTest({
      configPath,
      catalogPath,
      inputRecordsPath: 'bamboohr/all-streams.log',
    });
  });
});
