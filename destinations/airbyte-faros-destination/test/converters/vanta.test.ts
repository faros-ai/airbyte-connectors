import {getLocal, Mockttp} from 'mockttp';

import {looksLikeGithubCommitSha} from '../../src/converters/vanta/vulnerabilities';
import {
  initMockttp,
  readTestResourceAsJSON,
  readTestResourceFile,
  tempConfig,
} from '../testing-tools';
import {runTest} from './utils';

const mockQueryToResponse: Record<string, any> = readTestResourceAsJSON(
  'vanta/mockQueryNamesToObjects.json'
);

function getQueryResponse(
  query: string,
  test_by_groups: Record<string, Record<string, any[]>>
): {data: any} | null {
  const split_query = query.split(' ');
  const query_name = split_query[1];
  // We grab the object name, which is currently the only string between double quotes:
  const regex = /"([^"]*)"/g;
  let match;
  const matches = [];
  while ((match = regex.exec(query)) !== null) {
    matches.push(match[1]);
  }
  if (matches.length === 0) {
    throw new Error('No double quotes found in query.');
  }
  if (matches.length > 1) {
    throw new Error('Multiple double quotes found in query.');
  }
  const object_name = matches[0];
  const resList = test_by_groups[query_name][object_name];
  if (!resList) {
    throw new Error(
      `Query name ${query_name} or object name ${object_name} not found in test_by_groups.`
    );
  }
  return {data: resList};
}

describe('vanta', () => {
  // Logic to test:
  // 1. Check Duplicate UIDs across AWS vulns
  // 2. Check Github Commit Sha Regex

  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/vanta/catalog.json';
  const streamNamePrefix = 'mytestsource__vanta__';
  const streamsLog1 = readTestResourceFile('vanta/streams.log');
  const streamsLog2 = readTestResourceFile('vanta/streams2.log');
  const streamsLog3 = readTestResourceFile('vanta/streams3.log');

  beforeEach(async () => {
    await initMockttp(mockttp);
    await mockttp
      .forPost('/graphs/test-graph/graphql')
      .thenCallback(async (req) => {
        const body = await req.body.getJson();
        const query = body['query'];
        const res = getQueryResponse(query, mockQueryToResponse);
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
    return await tempConfig(mockttp.url);
  };

  test('test entries', async () => {
    const configPath = await getTempConfig(mockttp);
    const processedByStream = {
      vulnerabilities: 3,
    };
    const writtenByModel = {
      cicd_ArtifactVulnerability: 2,
      sec_Vulnerability: 3,
      vcs_RepositoryVulnerability: 1,
    };
    await runTest(
      configPath,
      catalogPath,
      processedByStream,
      writtenByModel,
      streamsLog2,
      streamNamePrefix
    );
  });

  test('test no entries', async () => {
    const configPath = await getTempConfig(mockttp);
    const processedByStream = {
      vulnerabilities: 3,
    };
    const writtenByModel = {
      sec_Vulnerability: 3,
    };
    await runTest(
      configPath,
      catalogPath,
      processedByStream,
      writtenByModel,
      streamsLog1,
      streamNamePrefix
    );
  });

  test('test entries with duplicate UIDs', async () => {
    const configPath = await getTempConfig(mockttp);
    const processedByStream = {
      vulnerabilities: 5,
    };
    const writtenByModel = {
      cicd_ArtifactVulnerability: 2,
      sec_Vulnerability: 3,
      vcs_RepositoryVulnerability: 1,
    };
    await runTest(
      configPath,
      catalogPath,
      processedByStream,
      writtenByModel,
      streamsLog3,
      streamNamePrefix
    );
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
      res.push(looksLikeGithubCommitSha(s));
    }
    expect(res).toEqual(out);
  });
});
