import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import VError from 'verror';

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

  test('check connection - invalid', async () => {
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
        true,
        5,
        100,
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

  test('streams - pull_requests', async () => {
    await testStream(
      0,
      readTestResourceFile('config.json'),
      {
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
      },
      {project: 'TEST'}
    );
  });

  test('streams - sprint_reports', async () => {
    await testStream(
      1,
      readTestResourceFile('config.json'),
      {
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
      },
      {board: '1'}
    );
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

  test('onBeforeRead with run_mode WebhookComplement should filter streams', async () => {
    const source = new sut.JiraSource(logger);
    const catalog = readTestResourceFile('catalog.json');
    const config = readTestResourceFile('config.json');
    config.run_mode = RunMode.WebhookComplement;
    const {catalog: newCatalog} = await source.onBeforeRead(config, catalog);
    expect(newCatalog.streams).toHaveLength(3);
    expect(newCatalog).toMatchSnapshot();
  });

  test('onBeforeRead with run_mode Full should not filter streams', async () => {
    const source = new sut.JiraSource(logger);
    const catalog = readTestResourceFile('catalog.json');
    const config = readTestResourceFile('config.json');
    config.run_mode = RunMode.Full;
    const {catalog: newCatalog} = await source.onBeforeRead(config, catalog);
    expect(newCatalog.streams).toHaveLength(4);
    expect(newCatalog).toMatchSnapshot();
  });
});
