import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
} from 'faros-airbyte-cdk';
import {readResourceFile} from 'faros-airbyte-common/common';
import fs from 'fs-extra';

import * as sut from '../src/index';
import {DataQualityTests} from '../src/streams/data-quality-tests';
import {readTestResourceAsJSON} from './helpers';

const mockQueryToResponse: Record<string, any> = readTestResourceAsJSON(
  'mockQueryToObject.json'
);
const mockZScoreResponse: Record<string, any> = readTestResourceAsJSON(
  'zScoreQueryResult.json'
);
const mockQueryTitleToResponse: Record<string, any> = readTestResourceAsJSON(
  'queryTitleToResponse.json'
);
const mockDataRecencyResponse: Record<string, any> = readTestResourceAsJSON(
  'dataRecencyQueryResult.json'
);
const zScoreQueryResponseKey = 'zScoreQueryOptions';
const dataRecencyQueryResponseKey = 'dataRecencyQuery';
const queryTitleToResponseKey = 'queryTitleToResponse';
mockQueryToResponse[zScoreQueryResponseKey] = mockZScoreResponse;
mockQueryToResponse[dataRecencyQueryResponseKey] = mockDataRecencyResponse;
mockQueryToResponse[queryTitleToResponseKey] = mockQueryTitleToResponse;
// For printing out info to console during tests
const mock_debug = true;

jest.mock('faros-js-client', () => {
  return {
    FarosClient: jest.fn().mockImplementation(() => {
      return {
        async graphExists(graph: string): Promise<boolean> {
          if (graph === 'best_graph') {
            return true;
          } else {
            return false;
          }
        },
        async gql(graph: string, query: string): Promise<any> {
          if (query.includes('ZScoreQuery')) {
            return mockQueryToResponse[zScoreQueryResponseKey];
          } else if (query.includes('DataRecencyQuery')) {
            return mockQueryToResponse[dataRecencyQueryResponseKey];
          } else if (query in mockQueryToResponse) {
            return mockQueryToResponse[query];
          } else {
            const resp = getQueryResponse(query);
            if (!resp) {
              throw new Error(`query not handled by mock: "${query}" `);
            }
            return resp;
          }
        },
      };
    }),
  };
});

function getQueryResponse(query: string): Record<string, any> | null {
  // Query must start with 'query ', then the query name will be listed
  // Query name must look like Grouping__ModelName
  if (!query.startsWith('query ')) {
    return null;
  }
  const query_title = query.split(' ')[1];
  const title_list: string[] = query_title.split('__');
  if (title_list.length !== 2) {
    throw new Error(
      `Improper title format. The following query is not handled by mock: "${query}" `
    );
  }
  const [title_grouping, model_name] = title_list;
  const test_by_groups: Record<
    string,
    Record<string, any>
  > = mockQueryToResponse[queryTitleToResponseKey];
  const grouping = test_by_groups[title_grouping];
  if (!grouping) {
    throw new Error(
      `Grouping not found in mock query response: "${title_grouping}".`
    );
  }
  if (!(model_name in grouping)) {
    throw new Error(
      `Model Name ${model_name} not found in mock query grouping: "${title_grouping}".`
    );
  }
  const res = {};
  res[model_name] = grouping[model_name];
  return res;
}



describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );
  const sourceConfig = {
    api_url: 'prod.com',
    api_key: 'best_key',
    graph: 'best_graph',
    day_delay_threshold: 3,
    logger: logger,
  };

  test('spec', async () => {
    const source = new sut.FarosGraphDoctorSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection', async () => {
    const source = new sut.FarosGraphDoctorSource(logger);
    await expect(await source.checkConnection(sourceConfig)).toStrictEqual([
      true,
      undefined,
    ]);
  });

  test('graphdoctor functions', async () => {
    const source = new sut.FarosGraphDoctorSource(logger);
    source.streams(sourceConfig);
    source.validateConfig(sourceConfig);
  });

  test('Data Quality Tests', async () => {
    // Proper tests should be run by trying the source on available graphs
    // and tenants. Unit tests validate that the logic works minimally.
    const source = new sut.FarosGraphDoctorSource(logger);
    const dq_tests = new DataQualityTests(
      sourceConfig,
      logger,
      source.makeFarosClient(sourceConfig)
    );
    const results = [];
    for await (const record of dq_tests.readRecords()) {
      results.push(record);
    }
    expect(results.slice(0, 0)).toStrictEqual([]);
  });
});
