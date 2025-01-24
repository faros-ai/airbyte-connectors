import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {ResultModel} from '../src';
import * as sut from '../src/index';
import {entrySchema, readResourceAsJSON} from './helpers';

const QUERY_HASH = 'acbd18db4cc2f85cedef654fccc4a4d8';

const BASE_CONFIG = {
  query: 'foo',
  api_url: 'x',
  api_key: 'y',
  graph: 'default',
  result_model: ResultModel.Nested,
};

const queryPaths = {
  model: {modelName: 'D', path: ['A', 'B', 'C']},
  nodeIds: [],
};

const adapterNodes: any[] = [{k3: 'v3'}, {k4: 'v4'}];
let graphExists: boolean;
let nodes: any[];

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
    QueryAdapter: jest.fn().mockImplementation(() => {
      return {
        nodes(): any {
          return {
            async *[Symbol.asyncIterator](): AsyncIterator<any> {
              for (const item of adapterNodes) {
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
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  beforeEach(() => {
    graphExists = false;
    nodes = [{k1: 'v1'}, {k2: 'v2'}];
  });

  test('spec', async () => {
    const source = new sut.FarosGraphSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceAsJSON('spec.json'))
    );
  });

  test('check connection failure', async () => {
    const source = new sut.FarosGraphSource(logger);
    await expect(source.checkConnection({} as any)).resolves.toStrictEqual([
      false,
      new VError('Faros API key was not provided'),
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
      new VError('Faros graph name was not provided'),
    ]);
    await expect(
      source.checkConnection({
        api_url: 'x',
        api_key: 'y',
      } as any)
    ).resolves.toStrictEqual([
      false,
      new VError('Faros graph name was not provided'),
    ]);
    await expect(
      source.checkConnection({
        api_url: 'x',
        api_key: 'y',
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
        graph: 'default',
        result_model: ResultModel.Nested,
      } as any)
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('check buckets config', async () => {
    const source = new sut.FarosGraphSource(logger);
    graphExists = true;
    const config = {
      api_url: 'x',
      api_key: 'y',
      graph: 'default',
      result_model: ResultModel.Nested,
    } as sut.GraphQLConfig;
    await expect(
      source.checkConnection({...config, bucket_id: 7, bucket_total: 10})
    ).resolves.toStrictEqual([true, undefined]);
    await expect(
      source.checkConnection({...config, query: 'foo', bucket_id: 7})
    ).resolves.toStrictEqual([
      false,
      new VError('Bucket id cannot be used in combination with query'),
    ]);
    await expect(
      source.checkConnection({...config, query: 'foo', bucket_total: 10})
    ).resolves.toStrictEqual([
      false,
      new VError('Bucket total cannot be used in combination with query'),
    ]);
    await expect(
      source.checkConnection({...config, bucket_id: 0, bucket_total: 10})
    ).resolves.toStrictEqual([false, new VError('Bucket id must be positive')]);
    await expect(
      source.checkConnection({...config, bucket_id: 7, bucket_total: -10})
    ).resolves.toStrictEqual([
      false,
      new VError('Bucket total must be positive'),
    ]);
    await expect(
      source.checkConnection({...config, bucket_id: 7, bucket_total: 4})
    ).resolves.toStrictEqual([
      false,
      new VError('Bucket id (7) cannot be larger than Bucket total (4)'),
    ]);
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

  test('incremental sync mode - V2', async () => {
    const source = new sut.FarosGraphSource(logger);
    graphExists = true;
    nodes = [
      {k1: 'v1', refreshedAt: '2022-10-19T22:02:14.483165+00:00'},
      {k2: 'v2', refreshedAt: '2023-11-14T22:13:20.000Z'},
    ];
    const stream = source.streams({
      ...BASE_CONFIG,
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
      {k1: 'v1', refreshedAt: '2022-10-19T22:02:14.483165+00:00'},
      {k2: 'v2', refreshedAt: '2023-11-14T22:13:20.000Z'},
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
      [QUERY_HASH]: {refreshedAtMillis: 1700000000000},
    });
  });
});
