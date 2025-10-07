import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
} from 'faros-airbyte-cdk';
import {
  readResourceAsJSON,
  readTestResourceAsJSON,
  sourceCheckTest,
  sourceReadTest,
  sourceSchemaTest,
} from 'faros-airbyte-testing-tools';

import * as sut from '../src/index';
import {Windsurf} from '../src/windsurf';

const setupWindsurfInstance = (mockMethods: any): void => {
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

  const source = new sut.WindsurfSource(logger);

  afterEach(() => {
    jest.restoreAllMocks();
    (Windsurf as any).windsurf = undefined;
  });

  test('spec', async () => {
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceAsJSON('spec.json'))
    );
  });

  test('check connection - valid config', async () => {
    setupWindsurfInstance({
      post: jest.fn().mockResolvedValue({data: {userTableStats: []}}),
    });
    await sourceCheckTest({
      source,
      configOrPath: 'config.json',
    });
  });

  test('check connection - invalid config', async () => {
    const error = new Error('Invalid service key');
    setupWindsurfInstance({
      post: jest.fn().mockRejectedValue(error),
    });
    await sourceCheckTest({
      source,
      configOrPath: 'config.json',
    });
  });

  test('streams - json schema fields', () => {
    sourceSchemaTest(source, readTestResourceAsJSON('config.json'));
  });

  test('streams - user page analytics', async () => {
    const res = readTestResourceAsJSON(
      'user_page_analytics/user_page_analytics.json'
    );
    setupWindsurfInstance({
      post: jest.fn().mockResolvedValue({data: res}),
    });
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'user_page_analytics/catalog.json',
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - autocomplete analytics', async () => {
    const userPageRes = readTestResourceAsJSON(
      'user_page_analytics/user_page_analytics.json'
    );
    const autocompleteRes = readTestResourceAsJSON(
      'autocomplete_analytics/autocomplete_analytics.json'
    );
    setupWindsurfInstance({
      post: jest
        .fn()
        .mockResolvedValueOnce({data: userPageRes})
        .mockResolvedValueOnce({data: autocompleteRes})
        .mockResolvedValueOnce({data: autocompleteRes}),
    });
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'autocomplete_analytics/catalog.json',
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - cascade lines', async () => {
    const userPageRes = readTestResourceAsJSON(
      'user_page_analytics/user_page_analytics.json'
    );
    const cascadeRes = readTestResourceAsJSON(
      'cascade_lines_analytics/cascade_lines_analytics.json'
    );
    setupWindsurfInstance({
      post: jest
        .fn()
        .mockResolvedValueOnce({data: userPageRes})
        .mockResolvedValueOnce({data: cascadeRes})
        .mockResolvedValueOnce({data: cascadeRes}),
    });
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'cascade_lines_analytics/catalog.json',
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - cascade runs', async () => {
    const userPageRes = readTestResourceAsJSON(
      'user_page_analytics/user_page_analytics.json'
    );
    const cascadeRes = readTestResourceAsJSON(
      'cascade_runs_analytics/cascade_runs_analytics.json'
    );
    setupWindsurfInstance({
      post: jest
        .fn()
        .mockResolvedValueOnce({data: userPageRes})
        .mockResolvedValueOnce({data: cascadeRes})
        .mockResolvedValueOnce({data: cascadeRes}),
    });
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'cascade_runs_analytics/catalog.json',
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - chat analytics', async () => {
    const userPageRes = readTestResourceAsJSON(
      'user_page_analytics/user_page_analytics.json'
    );
    const chatRes = readTestResourceAsJSON(
      'chat_analytics/chat_analytics.json'
    );
    setupWindsurfInstance({
      post: jest
        .fn()
        .mockResolvedValueOnce({data: userPageRes})
        .mockResolvedValueOnce({data: chatRes})
        .mockResolvedValueOnce({data: chatRes}),
    });
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'chat_analytics/catalog.json',
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });
});
