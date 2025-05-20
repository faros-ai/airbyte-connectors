import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  readTestResourceAsJSON,
  readResourceFile,
  readResourceAsJSON,
  sourceCheckTest,
  sourceReadTest,
  sourceSchemaTest,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import VError from 'verror';

import {GitLab} from '../src/gitlab';
import {GroupFilter} from '../src/group-filter';
import * as sut from '../src/index';


describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const source = new sut.GitLabSource(logger);

  afterEach(() => {
    jest.restoreAllMocks();
    (GitLab as any).gitlab = undefined;
    (GroupFilter as any)._instance = undefined;
  });

  test('spec', async () => {
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  function checkConnectionMock() {
    jest.spyOn(GitLab, 'instance').mockResolvedValue({} as any);
    jest.spyOn(GroupFilter, 'instance').mockReturnValue({
      getGroups: jest.fn().mockResolvedValue(['Group-1']),
    } as any);
  }

  test('check connection - token valid', async () => {
    checkConnectionMock();
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/token_valid.json',
    });
  });

  test('check connection - no groups', async () => {
    jest.spyOn(GitLab, 'instance').mockResolvedValue({} as any);
    jest.spyOn(GroupFilter, 'instance').mockReturnValue({
      getGroups: jest
        .fn()
        .mockRejectedValue(
          new VError(
            'No visible groups remain after applying inclusion and exclusion filters'
          )
        ),
    } as any);
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/token_valid.json',
    });
  });

  test('check connection - token missing', async () => {
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/token_invalid.json',
    });
  });

  test('check connection - authentication missing', async () => {
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/authentication_missing.json',
    });
  });

  test('check connection - invalid bucketing config - out of range', async () => {
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/bucket_out_of_range.json',
    });
  });

  test('check connection - invalid bucketing config - non positive integer', async () => {
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/bucket_negative.json',
    });
  });

  test('streams - json schema fields', () => {
    const source = new sut.GitLabSource(logger);
    sourceSchemaTest(source, readTestResourceAsJSON('config.json'));
  });

  test('streams - faros groups', async () => {
    const gitlab = {
      getGroup: jest.fn().mockResolvedValue({
        id: '1',
        name: 'Test Group',
        path: 'test-group',
        web_url: 'https://gitlab.com/test-group',
        description: 'Test group description',
        visibility: 'public',
        created_at: '2021-01-01T00:00:00Z',
        updated_at: '2021-01-01T00:00:00Z',
      }),
    };

    const groupFilter = {
      getGroups: jest.fn().mockResolvedValue(['test-group']),
    };

    jest.spyOn(GitLab, 'instance').mockResolvedValue(gitlab as any);
    jest.spyOn(GroupFilter, 'instance').mockReturnValue(groupFilter as any);

    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'faros_groups/catalog.json',
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('round robin bucket execution', async () => {
    const config = readTestResourceAsJSON('config.json');
    const catalog = readTestResourceAsJSON('faros_groups/catalog.json');
    const {config: newConfig, state: newState} = await source.onBeforeRead(
      {...config, round_robin_bucket_execution: true, bucket_total: 3},
      catalog,
      {__bucket_execution_state: {last_executed_bucket_id: 1}}
    );
    expect(newConfig.bucket_id).toBe(2);
    expect(newState).toMatchSnapshot();
  });
});
