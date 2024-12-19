import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import fs from 'fs-extra';

import * as sut from '../src/index';
import {Tromzo} from '../src/tromzo';

function readTestResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
}

function readQueryFile(fileName: string): string {
  return fs.readFileSync(`resources/queries/${fileName}`, 'utf8');
}

describe('streams', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const config = {
    api_key: 'test_api_key',
    organization: 'test',
    tools: ['codeql'],
    startDate: Utils.toDate('2024-01-01'),
  };

  async function testStream(
    tool: string,
    variables: any,
    syncMode: SyncMode = SyncMode.FULL_REFRESH
  ): Promise<void> {
    const postFn = jest.fn().mockResolvedValue({
      data: readTestResourceFile('findings.json'),
    });

    Tromzo.instance = jest.fn().mockImplementation(() => {
      return new Tromzo({post: postFn} as any, undefined, logger);
    });

    const source = new sut.TromzoSource(logger);
    const streams = source.streams(config);
    const stream = streams[0];
    const iter = stream.readRecords(
      syncMode,
      undefined,
      {tool},
      {codeql: {cutoff: new Date('2024-10-13').getTime()}}
    );

    const items = [];
    for await (const item of iter) {
      items.push(item);
    }
    expect(items).toMatchSnapshot();
    expect(postFn).toHaveBeenCalledWith(
      '',
      expect.objectContaining({
        query: expect.stringContaining(readQueryFile('findings.gql')),
        variables,
      })
    );
  }

  test('findings - full refresh', async () => {
    await testStream('codeql', {
      offset: 0,
      first: 100,
      q: `tool_name in ("codeql") and db_updated_at >= "2024-01-01T00:00:00.000Z"`,
    });
  });

  test('findings - incremental', async () => {
    await testStream(
      'codeql',
      {
        offset: 0,
        first: 100,
        q: `tool_name in ("codeql") and db_updated_at >= "2024-10-13T00:00:00.000Z"`,
      },
      SyncMode.INCREMENTAL
    );
  });

  test('findings - github has no timestamp filtering', async () => {
    await testStream('github dependabot', {
      offset: 0,
      first: 100,
      q: `tool_name in ("github dependabot")`,
    });
  });
});
