import {
  destinationWriteTest,
  initMockttp,
  tempConfig,
} from 'faros-airbyte-testing-tools';
import {getLocal} from 'mockttp';

describe('claude', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  let configPath: string;

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({
      api_url: mockttp.url,
      log_records: true,
    });
    await mockttp
      .forPost('/graphs/test-graph/graphql')
      .thenCallback(async (req) => {
        const body = await req.body.getJson();
        const query = body['query'];
        if (query.includes('vcs_UserTool')) {
          return {
            status: 200,
            body: JSON.stringify({
              data: {
                vcs_UserTool: [],
              },
            }),
          };
        }
        throw new Error(`Not mocked`);
      });
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/claude/catalog.json',
      inputRecordsPath: 'claude/all-streams.json',
      checkRecordsData: (records) => expect(records).toMatchSnapshot(),
    });
  });
});
