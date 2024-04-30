import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import {FarosClient} from 'faros-js-client';
import fs from 'fs-extra';
import VError from 'verror';

import {FarosIssuePullRequests} from '../lib/streams/faros_issue_pull_requests';
import * as sut from '../src/index';
import {Jira, JiraConfig} from '../src/jira';
import {RunMode} from '../src/streams/common';

function readResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
}

function readTestResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
}

describe('index', () => {
  const logger = new AirbyteLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const source = new sut.JiraSource(logger);

  test('spec', async () => {
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection - missing credentials ', async () => {
    const source = new sut.JiraSource(logger);
    await expect(
      source.checkConnection({url: 'https://jira.com'} as any)
    ).resolves.toStrictEqual([
      false,
      new VError(
        'Either Jira personal token or Jira username and password must be provided'
      ),
    ]);
  });

  test('check connection - invalid bucketing config - out of range', async () => {
    const source = new sut.JiraSource(logger);
    const config = readTestResourceFile('config.json');
    config.bucket_id = 3;
    config.bucket_total = 2;
    await expect(source.checkConnection(config)).resolves.toStrictEqual([
      false,
      new VError(`bucket_id must be between 1 and ${config.bucket_total}`),
    ]);
  });

  test('check connection - invalid bucketing config - non positive integer', async () => {
    const source = new sut.JiraSource(logger);
    const config = readTestResourceFile('config.json');
    config.bucket_id = 1;
    config.bucket_total = -1;
    await expect(source.checkConnection(config)).resolves.toStrictEqual([
      false,
      new VError(`bucket_total must be a positive integer`),
    ]);
  });

  test('check connection', async () => {
    const source = new sut.JiraSource(logger);
    await expect(
      source.checkConnection(readTestResourceFile('config.json'))
    ).resolves.toStrictEqual([true, undefined]);
  });

  function paginate<V>(
    items: V[],
    itemsField = 'values',
    pageSize = 1
  ): jest.Mock {
    const fn = jest.fn();
    let count = 0;
    do {
      const slice = items.slice(count, count + pageSize);
      count += slice.length;
      fn.mockResolvedValueOnce({
        isLast: count === items.length,
        [itemsField]: slice,
      });
    } while (count < items.length);
    return fn;
  }

  const testStream = async (
    streamIndex: any,
    streamConfig: JiraConfig,
    mockedImplementation?: any,
    streamSlice?: any
  ) => {
    Jira.instance = jest.fn().mockImplementation(() => {
      return new Jira(
        'https://jira.com',
        mockedImplementation ?? ({} as any),
        {} as any,
        new Map([['field_001', 'Development']]),
        50,
        new Map(),
        true,
        5,
        100,
        streamConfig.bucket_id,
        streamConfig.bucket_total,
        logger
      );
    });
    const source = new sut.JiraSource(logger);
    const streams = source.streams(streamConfig);
    const stream = streams[streamIndex];
    const iter = stream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      streamSlice,
      {}
    );

    const items = [];
    for await (const item of iter) {
      items.push(item);
    }
    expect(items).toMatchSnapshot();
  };

  const getIssuePullRequestsMockedImplementation = () => ({
    v2: {
      issueSearch: {
        searchForIssuesUsingJql: paginate(
          readTestResourceFile('issues_with_pull_requests.json'),
          'issues'
        ),
      },
    },
    getDevStatusSummary: jest
      .fn()
      .mockResolvedValue(readTestResourceFile('dev_status_summary.json')),
    getDevStatusDetail: jest
      .fn()
      .mockResolvedValue(readTestResourceFile('dev_status_detail.json')),
  });

  const getSprintReportsMockedImplementation = () => ({
    agile: {
      board: {
        getBoard: jest
          .fn()
          .mockResolvedValue(readTestResourceFile('board.json')),
        getAllSprints: paginate(readTestResourceFile('sprints.json')),
      },
    },
    getSprintReport: jest
      .fn()
      .mockResolvedValue(readTestResourceFile('sprint_report.json')),
  });

  test('streams - issue_pull_requests', async () => {
    await testStream(
      0,
      readTestResourceFile('config.json'),
      getIssuePullRequestsMockedImplementation(),
      {project: 'TEST'}
    );
  });

  test('streams - sprint_reports', async () => {
    await testStream(
      1,
      readTestResourceFile('config.json'),
      getSprintReportsMockedImplementation(),
      {board: '1'}
    );
  });

  test('streams - sprint_reports with run mode WebhookSupplement using Faros client', async () => {
    const gqlMock = jest.spyOn(FarosClient.prototype, 'gql');
    gqlMock.mockReturnValueOnce(
      Promise.resolve({
        tms_SprintBoardRelationship: [
          {
            sprint: {
              uid: '1',
              name: 'Sprint 1',
              state: 'closed',
              closedAt: '2024-01-01T00:00:00Z',
            },
          },
        ],
      })
    );
    gqlMock.mockReturnValueOnce(
      Promise.resolve({tms_SprintBoardRelationship: []})
    );
    let config = readTestResourceFile('config.json');
    config = {
      ...config,
      run_mode: RunMode.WebhookSupplement,
      api_key: 'SECRET',
      api_url: 'https://dev.api.faros.ai',
      graph: 'test',
    };
    await testStream(1, config, getSprintReportsMockedImplementation(), {
      board: '1',
    });
  });

  test('streams - board_issues using board ids', async () => {
    await testStream(
      2,
      readTestResourceFile('config.json'),
      {
        agile: {
          board: {
            getConfiguration: jest
              .fn()
              .mockResolvedValue(
                readTestResourceFile('board_configuration.json')
              ),
          },
        },
        v2: {
          filters: {
            getFilter: jest
              .fn()
              .mockResolvedValue(readTestResourceFile('board_filter.json')),
          },
          issueSearch: {
            searchForIssuesUsingJql: paginate(
              readTestResourceFile('issues_from_board.json'),
              'issues'
            ),
          },
        },
      },
      {board: '1'}
    );
  });

  test('onBeforeRead with run_mode WebhookSupplement should filter streams', async () => {
    const source = new sut.JiraSource(logger);
    const catalog = readTestResourceFile('catalog.json');
    const config = readTestResourceFile('config.json');
    config.run_mode = RunMode.WebhookSupplement;
    const {catalog: newCatalog} = await source.onBeforeRead(config, catalog);
    expect(newCatalog).toMatchSnapshot();
  });

  test('onBeforeRead with run_mode Full should not filter streams', async () => {
    const source = new sut.JiraSource(logger);
    const catalog = readTestResourceFile('catalog.json');
    const config = readTestResourceFile('config.json');
    config.run_mode = RunMode.Full;
    const {catalog: newCatalog} = await source.onBeforeRead(config, catalog);
    expect(newCatalog).toMatchSnapshot();
  });

  async function testStreamSlices(config: JiraConfig): Promise<void> {
    const stream = new FarosIssuePullRequests(config, logger);
    const slices = stream.streamSlices();
    // collect slices in an array and match with snapshot
    const sliceArray = [];
    for await (const slice of slices) {
      sliceArray.push(slice);
    }
    expect(sliceArray).toMatchSnapshot();
  }

  test('stream with project slices using bucketing', async () => {
    const config = readTestResourceFile('config.json');
    config.project_keys = ['TEST', 'TEST2', 'TEST3'];
    config.bucket_total = 2;
    // test with bucket_id 1 and 2
    config.bucket_id = 1;
    await testStreamSlices(config);

    config.bucket_id = 2;
    await testStreamSlices(config);
  });
});
