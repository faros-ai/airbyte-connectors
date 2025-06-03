import {
  destinationWriteTest,
  initMockttp,
  readTestResourceAsJSON,
  tempConfig,
} from 'faros-airbyte-testing-tools';
import * as fs from 'fs';
import {getLocal, Mockttp} from 'mockttp';

import {Vulnerabilities} from '../../src/converters/vanta/vulnerabilities';

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
        vanta: {
          debug_mode: true,
        },
      },
    });
  };

  test('extractVulnId', () => {
    const testCases = [
      {
        input: 'go.temporal.io/api:v1.29.2/CVE-2025-1243',
        expected: ['CVE', 'CVE-2025-1243'],
      },
      {
        input: 'krb5-libs:1.15.1/CVE-2024-37370',
        expected: ['CVE', 'CVE-2024-37370'],
      },
      {
        input: 'esbuild:0.23.1/GHSA-67mh-4wv8-2f99',
        expected: ['GHSA', 'GHSA-67mh-4wv8-2f99'],
      },
      {
        input: 'github.com/aws/aws-sdk-go:v1.53.15/CVE-2020-8911',
        expected: ['CVE', 'CVE-2020-8911'],
      },
      {
        input: 'python:2.7.18/CVE-2023-27043',
        expected: ['CVE', 'CVE-2023-27043'],
      },
      {
        input: 'org.keycloak:keycloak-core:25.0.2/GHSA-93ww-43rr-79v3',
        expected: ['GHSA', 'GHSA-93ww-43rr-79v3'],
      },
      // Edge cases
      {
        input: 'invalid-vulnerability-id',
        expected: null,
      },
      {
        input: '',
        expected: null,
      },
      {
        input: null,
        expected: null,
      },
    ];

    const vulnerabilities = new (class extends Vulnerabilities {})();

    for (const testCase of testCases) {
      const result = vulnerabilities['extractVulnId'](testCase.input);
      if (testCase.expected === null) {
        expect(result).toBeNull();
      } else {
        expect(result).toEqual(testCase.expected);
      }
    }
  });

  test('vulnerabilities', async () => {
    const configPath = await getTempConfig(mockttp);

    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/vanta/catalog.json',
      inputRecordsPath: 'vanta/vulnerability_records.log',
      checkRecordsData: (records) => {
        console.log('Processed records:', JSON.stringify(records, null, 2));
        expect(records).toMatchSnapshot();
      },
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
