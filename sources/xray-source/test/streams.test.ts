import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';

import * as sut from '../src/index';
import {Xray} from '../src/xray';

function readTestResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
}

describe('streams', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const config = {client_id: 'client_id', client_secret: 'client_secret'};

  async function testStream(
    streamIndex: number,
    responseFileOrFn: string | jest.Mock
  ): Promise<void> {
    const postFn =
      typeof responseFileOrFn === 'string'
        ? jest.fn().mockResolvedValue({
            data: {data: readTestResourceFile(responseFileOrFn)},
          })
        : responseFileOrFn;

    Xray.instance = jest.fn().mockImplementation(() => {
      return new Xray({post: postFn} as any, logger);
    });

    const source = new sut.XraySource(logger);
    const streams = source.streams(config);
    const stream = streams[streamIndex];
    const iter = stream.readRecords(SyncMode.FULL_REFRESH);

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
        data: {data: readTestResourceFile('getPlans.json')},
      })
      .mockResolvedValue({
        data: {data: readTestResourceFile('getTestPlanTests.json')},
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
