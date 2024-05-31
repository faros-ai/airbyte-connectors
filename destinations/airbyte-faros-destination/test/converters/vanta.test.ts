import {getLocal, Mockttp} from 'mockttp';

import {looksLikeGitCommitSha} from '../../src/converters/vanta/utils';
import {
  initMockttp,
  readTestResourceAsJSON,
  tempConfig,
} from '../testing-tools';
import {destinationWriteTest} from './utils';

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
    [
      'cicdArtifactVulnerabilityQuery',
      'vcsRepositoryVulnerabilityQuery',
    ].includes(query_name)
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
  // Logic to test:
  // 1. Check Duplicate UIDs across AWS vulns
  // 2. Check Github Commit Sha Regex
  // 3. Check all faros endpoint requests

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

  const getTempConfig = async (
    mockttp: Mockttp,
    updateExisting: boolean = false
  ): Promise<string> => {
    return await tempConfig({
      api_url: mockttp.url,
      source_specific_configs: {
        vanta: {
          updateExistingVulnerabilities: updateExisting,
        },
      },
    });
  };

  test('test entries', async () => {
    // We need to ensure that if there are several vulns associated with a single
    // artifact, we output all of them, and not just one vuln per artifact.
    // This data is included in the streams_regular.log file.
    const configPath = await getTempConfig(mockttp);
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/vanta/catalog.json',
      inputRecordsPath: 'vanta/streams_regular.log',
    });
  });

  test('test getting update records', async () => {
    const configPath = await getTempConfig(mockttp, true);
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/vanta/catalog.json',
      inputRecordsPath: 'vanta/streams_regular.log',
    });
  });

  test('test entries with duplicate UIDs', async () => {
    const configPath = await getTempConfig(mockttp);
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/vanta/catalog.json',
      inputRecordsPath: 'vanta/streams_duplicate_UIDs.log',
    });
  });

  test('test getting update records', async () => {
    const configPath = await getTempConfig(mockttp, true);
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/vanta/catalog.json',
      inputRecordsPath: 'vanta/streams_duplicate_UIDs.log',
    });
  });

  test('github commit sha', async () => {
    // hex string of length 40
    const sample_commit_sha = 'a123456789012345678901234567890123456789';

    // Examples of strings, some of which are valid and some are not
    const inp = [
      sample_commit_sha,
      sample_commit_sha + 'a',
      sample_commit_sha.slice(0, 39),
      'f'.repeat(40),
      // g is outside the alloted hex symbols
      'g'.repeat(40),
    ];
    const out = [true, false, false, true, false];
    const res = [];
    for (const s of inp) {
      res.push(looksLikeGitCommitSha(s));
    }
    expect(res).toEqual(out);
  });
});
