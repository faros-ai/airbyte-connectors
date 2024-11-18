import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  SyncMode,
} from 'faros-airbyte-cdk';
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
  };

  async function testStream(
    streamIndex: number,
    queryFile: string,
    variables: any,
    responseFile: string
  ): Promise<void> {
    const postFn = jest.fn().mockResolvedValue({
      data: readTestResourceFile(responseFile),
    });

    Tromzo.instance = jest.fn().mockImplementation(() => {
      return new Tromzo({post: postFn} as any, undefined, logger);
    });

    const source = new sut.TromzoSource(logger);
    const streams = source.streams(config);
    const stream = streams[streamIndex];
    const iter = stream.readRecords(SyncMode.FULL_REFRESH, undefined, {
      tool: 'codeql',
    });

    const items = [];
    for await (const item of iter) {
      items.push(item);
    }
    expect(items).toMatchSnapshot();
    expect(postFn).toHaveBeenCalledWith(
      '',
      expect.objectContaining({
        query: expect.stringContaining(readQueryFile(queryFile)),
        variables,
      })
    );
  }

  test('findings', async () => {
    await testStream(
      0,
      'findings.gql',
      {
        offset: 0,
        first: 100,
        q: `tool_name in ("codeql")`,
      },
      'findings.json'
    );
  });
});
