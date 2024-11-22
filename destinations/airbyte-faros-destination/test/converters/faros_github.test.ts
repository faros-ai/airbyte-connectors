import {omit} from 'lodash';
import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '../testing-tools';
import {destinationWriteTest} from './utils';

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
                    toolCategory: 'GitHubCopilot',
                    inactive: false,
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
      checkRecordsData: (records) => {
        // Remove 'at' field from vcs_PullRequestFile__Deletion records since we
        // cannot mock the date when destinationWriteTest runs the destination
        // program, so we need to remove it from the snapshot
        const cleanedRecords = records.map((record) => {
          const key = Object.keys(record)[0];
          if (key === 'vcs_PullRequestFile__Deletion') {
            expect(record[key].at).toBeDefined();
            return {[key]: omit(record[key], 'at')};
          }
          return record;
        });
        expect(cleanedRecords).toMatchSnapshot();
      },
    });
  });
});
