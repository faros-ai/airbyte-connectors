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

const sample_commit_sha = 'a123456789012345678901234567890123456789';

function getQueryResponse(
  query: string,
  test_by_groups: Record<string, Record<string, any[]>>
): any[] | null {
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
  const res = test_by_groups[query_name][object_name];
  if (!res) {
    throw new Error(
      `Query name ${query_name} or object name ${object_name} not found in test_by_groups.`
    );
  }
  return res;
}

describe('vanta', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/vanta/catalog.json';
  const streamNamePrefix = 'mytestsource__vanta__';
  const streamsLog = readTestResourceFile('vanta/streams.log');

  beforeAll(async () => {
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

  afterAll(async () => {
    await mockttp.stop();
  });

  const getTempConfig = async (mockttp: Mockttp): Promise<string> => {
    return await tempConfig(mockttp.url);
  };

  test('test1', async () => {
    const configPath = await getTempConfig(mockttp);
    const processedByStream = {
      vulnerabilities: 3,
    };
    const writtenByModel = {
      cicd_ArtifactVulnerability: 1,
      sec_Vulnerability: 3,
    };
    await runTest(
      configPath,
      catalogPath,
      processedByStream,
      writtenByModel,
      streamsLog,
      streamNamePrefix
    );
  });

  test('github commit sha', async () => {
    // Examples of strings, some of which are valid and some are not
    const inp = [
      sample_commit_sha,
      'a12345678901234567890123456789012345678',
      'f'.repeat(40),
      // g is outside the alloted hex symbols
      'g'.repeat(40),
    ];
    const out = [true, false, true, false];
    const res = [];
    for (const s of inp) {
      res.push(looksLikeGithubCommitSha(s));
    }
    expect(res).toEqual(out);
  });
});
