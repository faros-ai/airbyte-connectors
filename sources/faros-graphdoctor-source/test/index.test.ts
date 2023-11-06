import {AirbyteLogger, AirbyteLogLevel, AirbyteSpec} from 'faros-airbyte-cdk';
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
const zScoreQueryResponseKey = 'zScoreQueryOptions';
mockQueryToResponse[zScoreQueryResponseKey] = mockZScoreResponse;

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
  console.log('query title: ' + query_title);
  const title_list: string[] = query_title.split('__');
  if (!(title_list.length == 2)) {
    throw new Error(
      `Improper title format. query not handled by mock: "${query}" `
    );
  }
  const [title_grouping, model_name] = title_list;
  console.log(`title_grouping: ${title_grouping}, model_name: ${model_name}`);
  const test_by_groups: Record<
    string,
    Record<string, any>
  > = mockQueryToResponse['queryTitleToResponse'];
  const grouping = test_by_groups[title_grouping];
  if (!grouping) {
    throw new Error(
      `Grouping not found in mock query response: "${title_grouping}".`
    );
  }
  return grouping[model_name];
}

function readResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
}

describe('index', () => {
  const logger = new AirbyteLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );
  const sourceConfig = {
    api_url: 'prod.com',
    api_key: 'best_key',
    graph: 'best_graph',
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
    expect(results.slice(0, 3)).toStrictEqual([
      {
        faros_DataQualityIssue: {
          uid: '-703795182',
          model: 'org_Team',
          description:
            'Team other than all_teams has missing parent team, uid=c',
          recordIds: ['a'],
        },
      },
      {
        faros_DataQualityIssue: {
          uid: '-1496261476',
          model: 'org_TeamMembership',
          description:
            "Team Membership with ID 'c' has missing 'team' or 'member'",
          recordIds: ['c'],
        },
      },
      {
        faros_DataQualityIssue: {
          uid: '-1496261476',
          model: 'org_TeamMembership',
          description:
            "Team Membership with ID 'c' has missing 'team' or 'member'",
          recordIds: ['c'],
        },
      },
    ]);
  });
});
