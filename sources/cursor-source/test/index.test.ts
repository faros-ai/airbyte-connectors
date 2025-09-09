import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import {
  readResourceAsJSON,
  readTestResourceAsJSON,
  sourceCheckTest,
  sourceReadTest,
  sourceSchemaTest,
} from 'faros-airbyte-testing-tools';

import {Cursor} from '../src/cursor';
import * as sut from '../src/index';

const setupCursorInstance = (mockMethods: any) => {
  jest
    .spyOn(require('faros-js-client'), 'makeAxiosInstanceWithRetry')
    .mockReturnValue(mockMethods);
};

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const source = new sut.CursorSource(logger);

  afterEach(() => {
    jest.restoreAllMocks();
    (Cursor as any).cursor = undefined;
  });

  test('spec', async () => {
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceAsJSON('spec.json'))
    );
  });

  test('check connection - valid config', async () => {
    setupCursorInstance({
      get: jest.fn().mockResolvedValue({data: {teamMembers: []}}),
    });
    await sourceCheckTest({
      source,
      configOrPath: 'config.json',
    });
  });

  test('check connection - invalid config', async () => {
    const error = new Error('Invalid API key');
    setupCursorInstance({
      get: jest.fn().mockRejectedValue(error),
    });
    await sourceCheckTest({
      source,
      configOrPath: 'config.json',
    });
  });

  test('streams - json schema fields', () => {
    sourceSchemaTest(source, readTestResourceAsJSON('config.json'));
  });

  test('streams - daily usage', async () => {
    const res = readTestResourceAsJSON('daily_usage/daily_usage.json');
    setupCursorInstance({
      post: jest.fn().mockResolvedValue({data: res}),
    });
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'daily_usage/catalog.json',
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - members', async () => {
    const usageEventsRes = readTestResourceAsJSON(
      'usage_events/usage_events.json'
    );
    const res = readTestResourceAsJSON('members/members.json');
    setupCursorInstance({
      post: jest.fn().mockResolvedValue({data: usageEventsRes}),
      get: jest.fn().mockResolvedValue({data: res}),
    });
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'members/catalog.json',
      checkRecordsData: (records) => {
        // skip records emitted by the usage_events stream
        expect(
          records.slice(usageEventsRes.usageEvents.length)
        ).toMatchSnapshot();
      },
    });
  });

  test('streams - usage events', async () => {
    const res = readTestResourceAsJSON('usage_events/usage_events.json');
    setupCursorInstance({
      post: jest.fn().mockResolvedValue({data: res}),
    });
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'usage_events/catalog.json',
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - ai commit metrics', async () => {
    const res = readTestResourceAsJSON(
      'ai_commit_metrics/ai_commit_metrics.json'
    );
    setupCursorInstance({
      get: jest.fn().mockResolvedValue({data: res}),
    });
    const config = readTestResourceAsJSON('config.json');
    await sourceReadTest({
      source,
      configOrPath: {...config, fetch_ai_commit_metrics: true},
      catalogOrPath: 'ai_commit_metrics/catalog.json',
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - ai commit metrics excluded when flag is false', async () => {
    const config = readTestResourceAsJSON('config.json');
    const catalog = {
      streams: [
        {
          stream: {name: 'ai_commit_metrics', json_schema: {}},
          sync_mode: SyncMode.FULL_REFRESH,
        },
        {
          stream: {name: 'daily_usage', json_schema: {}},
          sync_mode: SyncMode.FULL_REFRESH,
        },
      ],
    };

    const result = await source.onBeforeRead(
      {...config, fetch_ai_commit_metrics: false},
      catalog
    );

    expect(result.catalog.streams).toHaveLength(1);
    expect(result.catalog.streams[0].stream.name).toBe('daily_usage');
  });
});
