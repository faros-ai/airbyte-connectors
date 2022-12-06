import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import * as sut from '../src/index';
import {GraphQLVersion, ResultModel} from '../src/index';
import {entrySchema, readResource} from './helpers';

const QUERY_HASH = 'acbd18db4cc2f85cedef654fccc4a4d8';

const BASE_CONFIG = {
  query: 'foo',
  api_url: 'x',
  api_key: 'y',
  graphql_api: GraphQLVersion.V1,
  graph: 'default',
  result_model: ResultModel.Nested,
};

const queryPaths = {
  model: {modelName: 'D', path: ['A', 'B', 'C']},
  nodeIds: [],
};

let graphExists = false;
let nodes: any[] = [{k1: 'v1'}, {k2: 'v2'}];
jest.mock('faros-js-client', () => {
  return {
    FarosClient: jest.fn().mockImplementation(() => {
      return {
        entrySchema(): any {
          return entrySchema;
        },
        graphExists(): any {
          return graphExists;
        },
        nodeIterable(): any {
          return {
            async *[Symbol.asyncIterator](): AsyncIterator<any> {
              for (const item of nodes) {
                yield item;
              }
            },
          };
        },
      };
    }),
    toIncrementalV1: jest.fn(),
    toIncrementalV2: jest.fn(),
  };
});

describe('index', () => {
  const logger = new AirbyteLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  test('spec', async () => {
    const source = new sut.FarosGraphSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResource('spec.json'))
    );
  });

  test('check connection failure', async () => {
    const source = new sut.FarosGraphSource(logger);
    await expect(source.checkConnection({} as any)).resolves.toStrictEqual([
      false,
      new VError('Faros API url was not provided'),
    ]);
    await expect(
      source.checkConnection({api_url: 'x'} as any)
    ).resolves.toStrictEqual([
      false,
      new VError('Faros API key was not provided'),
    ]);
    await expect(
      source.checkConnection({api_url: 'x', api_key: 'y'} as any)
    ).resolves.toStrictEqual([
      false,
      new VError('Faros GraphQL API version was not set'),
    ]);
    await expect(
      source.checkConnection({
        api_url: 'x',
        api_key: 'y',
        graphql_api: GraphQLVersion.V1,
      } as any)
    ).resolves.toStrictEqual([
      false,
      new VError('Faros graph name was not provided'),
    ]);
    await expect(
      source.checkConnection({
        api_url: 'x',
        api_key: 'y',
        graphql_api: GraphQLVersion.V1,
        graph: 'default',
      } as any)
    ).resolves.toStrictEqual([
      false,
      new VError('Result model was not provided'),
    ]);
    await expect(
      source.checkConnection({
        api_url: 'x',
        api_key: 'y',
        graphql_api: GraphQLVersion.V1,
        graph: 'default',
        result_model: ResultModel.Nested,
      } as any)
    ).resolves.toStrictEqual([
      false,
      new VError('Graph default does not exist!'),
    ]);
  });

  test('check connection success', async () => {
    const source = new sut.FarosGraphSource(logger);
    graphExists = true;
    await expect(
      source.checkConnection({
        api_url: 'x',
        api_key: 'y',
        graphql_api: GraphQLVersion.V1,
        graph: 'default',
        result_model: ResultModel.Nested,
      } as any)
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('full_refresh sync mode', async () => {
    const source = new sut.FarosGraphSource(logger);
    graphExists = true;
    const iter = source
      .streams(BASE_CONFIG)[0]
      .readRecords(SyncMode.FULL_REFRESH, undefined, {
        query: 'foo',
        queryPaths,
      });

    const records = [];
    for await (const record of iter) {
      records.push(record);
    }

    expect(records).toMatchSnapshot();
  });

  test('incremental sync mode - V1', async () => {
    const source = new sut.FarosGraphSource(logger);
    graphExists = true;
    nodes = [
      {k1: 'v1', metadata: {refreshedAt: 12}},
      {k2: 'v2', metadata: {refreshedAt: 23}},
    ];
    const stream = source.streams(BASE_CONFIG)[0];
    const iter = stream.readRecords(
      SyncMode.INCREMENTAL,
      undefined,
      {query: 'foo', queryPaths},
      {[QUERY_HASH]: {refreshedAtMillis: 1}}
    );

    const records = [];
    for await (const record of iter) {
      records.push(record);
    }

    expect(records).toMatchSnapshot();
    expect(stream.getUpdatedState(undefined, undefined)).toEqual({
      [QUERY_HASH]: {refreshedAtMillis: 23},
    });
  });

  test('incremental sync mode - V2', async () => {
    const source = new sut.FarosGraphSource(logger);
    graphExists = true;
    nodes = [
      {k1: 'v1', refreshedAt: '2022-10-19T22:02:14.483165+00:00'},
      {k2: 'v2', refreshedAt: '2023-11-14T22:13:20.000Z'},
    ];
    const stream = source.streams({
      ...BASE_CONFIG,
      graphql_api: GraphQLVersion.V2,
    } as any)[0];
    const iter = stream.readRecords(
      SyncMode.INCREMENTAL,
      undefined,
      {query: 'foo', queryPaths},
      {[QUERY_HASH]: {refreshedAtMillis: 1}}
    );

    const records = [];
    for await (const record of iter) {
      records.push(record);
    }

    expect(records).toMatchSnapshot();
    expect(stream.getUpdatedState(undefined, undefined)).toEqual({
      [QUERY_HASH]: {refreshedAtMillis: 1700000000000},
    });
  });

  test('flat result model', async () => {
    const source = new sut.FarosGraphSource(logger);
    graphExists = true;
    nodes = [
      {k1: 'v1', metadata: {refreshedAt: 12}},
      {k2: 'v2', metadata: {refreshedAt: 23}},
    ];
    const stream = source.streams({
      ...BASE_CONFIG,
      result_model: ResultModel.Flat,
    })[0];
    const iter = stream.readRecords(
      SyncMode.INCREMENTAL,
      undefined,
      {query: 'foo', queryPaths},
      {[QUERY_HASH]: {refreshedAtMillis: 1}}
    );

    const records = [];
    for await (const record of iter) {
      records.push(record);
    }

    expect(records).toMatchSnapshot();
    expect(stream.getUpdatedState(undefined, undefined)).toEqual({
      [QUERY_HASH]: {refreshedAtMillis: 23},
    });
  });

  test('replace node IDs with model keys', async () => {
    const source = new sut.FarosGraphSource(logger);
    graphExists = true;
    nodes = [
      {
        id: 'PGNpY2RfQXJ0aWZhY3RDb21taXRBc3NvY2lhdGlvbnwCAgICCE1vY2sCEGZhcm9zLWFpAg5zb2xhcmlzAgIwAgICDnNvbGFyaXMCAghNb2NrAhBmYXJvcy1haQICMA==',
        artifact: {
          id: 'GmNpY2RfQXJ0aWZhY3Q8AgICCE1vY2sCEGZhcm9zLWFpAg5zb2xhcmlzAgIw',
        },
        commit: {
          id: 'FHZjc19Db21taXQ8AgIOc29sYXJpcwICCE1vY2sCEGZhcm9zLWFpAgIw',
        },
        metadata: {refreshedAt: 12},
      },
    ];
    const stream = source.streams({
      ...BASE_CONFIG,
      result_model: ResultModel.Flat,
    })[0];
    const iter = stream.readRecords(SyncMode.INCREMENTAL, undefined, {
      incremental: true,
      query: 'foo',
      queryPaths: {
        model: {
          modelName: 'cicd_ArtifactCommit',
          path: ['cicd', 'artifactCommits', 'nodes'],
        },
        nodeIds: [['id'], ['artifact', 'id'], ['commit', 'id']],
      },
    });

    const records = [];
    for await (const record of iter) {
      records.push(record);
    }
    expect(records).toMatchSnapshot();
    expect(stream.getUpdatedState(undefined, undefined)).toEqual({
      cicd_ArtifactCommit: {refreshedAtMillis: 12},
    });
  });
});
