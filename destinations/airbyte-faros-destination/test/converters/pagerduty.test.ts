import {getLocal} from 'mockttp';

import {initMockttp, sourceSpecificTempConfig} from '../testing-tools';
import {destinationWriteTest} from './utils';

describe('pagerduty', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  let configPath: string;

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await sourceSpecificTempConfig(mockttp.url, {
      pagerduty: {associate_applications_to_teams: true},
    });
    await mockttp
      .forPost('/graphs/test-graph/graphql')
      .once()
      .thenReply(
        200,
        JSON.stringify({
          data: {org_Team: [{_id: '1', uid: 'eng', name: 'Engineering'}]},
        })
      );
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/pagerduty/catalog.json',
      inputRecordsPath: 'pagerduty/all-streams.log',
    });
  });
});
