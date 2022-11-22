import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import {PathToModel} from 'faros-js-client';
import fs from 'fs-extra';
import VError from 'verror';

import * as sut from '../src/index';
import {GraphQLVersion, ResultModel} from '../src/index';

function readResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
}

const BASE_CONFIG = {
  query: 'foo',
  api_url: 'x',
  api_key: 'y',
  graphql_api: GraphQLVersion.V1,
  graph: 'default',
  result_model: ResultModel.Nested,
};

const PATH_TO_MODEL: PathToModel = {modelName: 'D', path: ['A', 'B', 'C']};

let graphExists = false;
let nodes: any[] = [{k1: 'v1'}, {k2: 'v2'}];
jest.mock('faros-js-client', () => {
  return {
    FarosClient: jest.fn().mockImplementation(() => {
      return {
        graphExists: (): any => {
          return graphExists;
        },
        nodeIterable: (): any => {
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
      new AirbyteSpec(readResourceFile('spec.json'))
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
        pathToModel: PATH_TO_MODEL,
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
      {query: 'foo', pathToModel: PATH_TO_MODEL},
      {foo: {refreshedAtMillis: 1}}
    );

    const records = [];
    for await (const record of iter) {
      records.push(record);
    }

    expect(records).toMatchSnapshot();
    expect(stream.getUpdatedState(undefined, undefined)).toEqual({
      foo: {refreshedAtMillis: 23},
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
      {query: 'foo', pathToModel: PATH_TO_MODEL},
      {foo: {refreshedAtMillis: 1}}
    );

    const records = [];
    for await (const record of iter) {
      records.push(record);
    }

    expect(records).toMatchSnapshot();
    expect(stream.getUpdatedState(undefined, undefined)).toEqual({
      foo: {refreshedAtMillis: 1700000000000},
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
      {query: 'foo', pathToModel: PATH_TO_MODEL},
      {foo: {refreshedAtMillis: 1}}
    );

    const records = [];
    for await (const record of iter) {
      records.push(record);
    }

    expect(records).toMatchSnapshot();
    expect(stream.getUpdatedState(undefined, undefined)).toEqual({
      foo: {refreshedAtMillis: 23},
    });
  });
});
