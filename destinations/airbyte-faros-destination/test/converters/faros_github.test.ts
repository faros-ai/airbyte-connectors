import {
  destinationWriteTest,
  initMockttp,
  tempConfig,
} from 'faros-airbyte-testing-tools';
import {getLocal} from 'mockttp';

describe('faros_github', () => {
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
                vcs_UserTool: [
                  {
                    _id: '1',
                    user: {
                      uid: 'oldkit',
                    },
                    toolCategory: 'CodingAssistant',
                    toolDetail: 'GitHubCopilot',
                    inactive: false,
                    startedAt: '2024-07-15T17:43:12.098Z',
                    endedAt: '2024-08-15T17:43:12.098Z',
                  },
                ],
              },
            }),
          };
        }
        throw new Error(`Not mocked`);
      });
  });

  afterEach(async () => {
    await mockttp.stop();
    jest.restoreAllMocks();
  });

  test('process records from all streams', async () => {
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/faros_github/catalog.json',
      inputRecordsPath: 'faros_github/all-streams.log',
      checkRecordsData: (records) => expect(records).toMatchSnapshot(),
    });
  });
});
