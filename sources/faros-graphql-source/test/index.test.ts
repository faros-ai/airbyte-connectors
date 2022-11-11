import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import * as sut from '../src/index';
import {GraphQLVersion} from '../src/index';

let graphExists = false;
const nodes = [{k1: 'v1'}, {k2: 'v2'}];
jest.mock('faros-js-client', () => {
  return {
    FarosClient: jest.fn().mockImplementation(() => {
      return {
        graphExists: () => {
          return graphExists;
        },
        nodeIterable: () => {
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
      new VError('Missing api_url'),
    ]);
    await expect(
      source.checkConnection({api_url: 'x'} as any)
    ).resolves.toStrictEqual([false, new VError('Missing api_key')]);
    await expect(
      source.checkConnection({api_url: 'x', api_key: 'y'} as any)
    ).resolves.toStrictEqual([false, new VError('Missing graphql_api')]);
    await expect(
      source.checkConnection({
        api_url: 'x',
        api_key: 'y',
        graphql_api: GraphQLVersion.V1,
      } as any)
    ).resolves.toStrictEqual([false, new VError('Missing graph')]);
    await expect(
      source.checkConnection({
        api_url: 'x',
        api_key: 'y',
        graphql_api: GraphQLVersion.V1,
        graph: 'default',
      } as any)
    ).resolves.toStrictEqual([false, new VError('Graph does not exist!')]);
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
      } as any)
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('full_refresh sync mode', async () => {
    const source = new sut.FarosGraphSource(logger);
    graphExists = true;
    const iter = source
      .streams({} as any)[0]
      .readRecords(SyncMode.FULL_REFRESH, undefined, undefined);

    const records = [];
    for await (const record of iter) {
      records.push(record);
    }

    expect(records).toMatchSnapshot();
  });
});
