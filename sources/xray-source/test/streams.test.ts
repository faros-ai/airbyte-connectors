import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  SyncMode,
  readTestFileAsJSON,
} from 'faros-airbyte-cdk';

import * as sut from '../src/index';
import {Xray} from '../src/xray';

describe('streams', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const config = {
    authentication: {client_id: 'client_id', client_secret: 'client_secret'},
    projects: ['TEST'],
  };

  async function testStream(
    streamIndex: number,
    responseFileOrFn: string | jest.Mock
  ): Promise<void> {
    const postFn =
      typeof responseFileOrFn === 'string'
        ? jest.fn().mockResolvedValue({
            data: {data: readTestFileAsJSON(responseFileOrFn)},
          })
        : responseFileOrFn;

    Xray.instance = jest.fn().mockImplementation(() => {
      return new Xray({post: postFn} as any, 100, logger);
    });

    const source = new sut.XraySource(logger);
    const streams = source.streams(config);
    const stream = streams[streamIndex];
    const iter = stream.readRecords(SyncMode.FULL_REFRESH, undefined, {
      project: 'TEST',
    });

    const items = [];
    for await (const item of iter) {
      items.push(item);
    }
    expect(items).toMatchSnapshot();
  }

  test('test plans', async () => {
    await testStream(0, 'getPlans.json');
  });

  test('tests', async () => {
    await testStream(1, 'getTests.json');
  });

  test('test plan tests', async () => {
    const mockFn = jest
      .fn()
      .mockResolvedValueOnce({
        data: {data: readTestFileAsJSON('getPlans.json')},
      })
      .mockResolvedValue({
        data: {data: readTestFileAsJSON('getTestPlanTests.json')},
      });
    await testStream(2, mockFn);
  });

  test('test executions', async () => {
    await testStream(3, 'getTestExecutions.json');
  });

  test('test runs', async () => {
    await testStream(4, 'getTestRuns.json');
  });
});
