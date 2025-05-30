import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '@faros-ai/airbyte-testing-tools';
import {destinationWriteTest} from '@faros-ai/airbyte-testing-tools';

describe('pagerduty', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  let configPath: string;

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({
      api_url: mockttp.url,
      log_records: true,
      source_specific_configs: {
        pagerduty: {associate_applications_to_teams: true},
      },
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
      checkRecordsData: (records) => expect(records).toMatchSnapshot(),
    });
  });
});
