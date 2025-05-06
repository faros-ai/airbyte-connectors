import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '../../src/testing-tools/testing-tools';
import {destinationWriteTest} from '../../src/testing-tools/utils';

describe('faros-org-import', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  let configPath: string;

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({
      api_url: mockttp.url,
      log_records: true,
      source_specific_configs: {
        faros_org_import: {
          source: {
            ams: 'test-ams',
            vcs: 'test-vcs',
            ims: 'test-ims',
            survey: 'test-survey',
            tms: 'test-tms',
            cal: 'test-cal',
          },
        },
      },
    });

    await mockttp.forPost('/graphs/test-graph/graphql').thenReply(200, '[]');
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/faros-org-import/catalog.json',
      inputRecordsPath: 'faros-org-import/all-streams.log',
      checkRecordsData: (records) => expect(records).toMatchSnapshot(),
    });
  });
});
