import {getLocal, Mockttp} from 'mockttp';

import {
  initMockttp,
  readTestResourceAsJSON,
  tempConfig,
} from '../../src/testing-tools/testing-tools';
import {destinationWriteTest} from '../../src/testing-tools/utils';

const mockQueryToResponse: Record<string, any> = readTestResourceAsJSON(
  'vanta/mockQueryNamesToObjects.json'
);

function getQueryResponse(
  query: string,
  vars: Record<string, any>,
  mockQueryToResponse: Record<string, Record<string, any[]>>
): {data: any} | null {
  const split_query = query.split(' ');
  let query_name = split_query[1];
  query_name = query_name.split('(')[0];
  if (
    ['cicdArtifactQueryByCommitSha', 'vcsRepositoryQuery'].includes(query_name)
  ) {
    return {
      data: mockQueryToResponse[query_name],
    };
  }
  const object_name = Object.values(vars)[0];
  const resList = mockQueryToResponse[query_name][object_name];
  if (!resList) {
    throw new Error(
      `Query name ${query_name} or object name ${object_name} not found in mockQueryToResponses.`
    );
  }
  return {data: resList};
}

describe('vanta', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});

  beforeEach(async () => {
    await initMockttp(mockttp);
    await mockttp
      .forPost('/graphs/test-graph/graphql')
      .thenCallback(async (req) => {
        const body = await req.body.getJson();
        const vars = body['variables'];
        const query = body['query'];
        const res = getQueryResponse(query, vars, mockQueryToResponse);
        return {
          status: 200,
          body: JSON.stringify(res),
        };
      });
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  const getTempConfig = async (mockttp: Mockttp): Promise<string> => {
    return await tempConfig({
      api_url: mockttp.url,
      log_records: true,
      source_specific_configs: {
        vanta: {},
      },
    });
  };

  test('vulnerabilities', async () => {
    const configPath = await getTempConfig(mockttp);
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/vanta/catalog.json',
      inputRecordsPath: 'vanta/vulnerability_records.log',
      checkRecordsData: (records) => expect(records).toMatchSnapshot(),
    });
  });

  test('vulnerability remediations', async () => {
    const configPath = await getTempConfig(mockttp);
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/vanta/catalog.json',
      inputRecordsPath: 'vanta/vulnerability_remediation_records.log',
    });
  });
});
