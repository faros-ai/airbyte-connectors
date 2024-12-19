import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import VError from 'verror';

import * as sut from '../src/index';
import {Findings} from '../src/streams/findings';
import {Tromzo} from '../src/tromzo';
import {TromzoConfig} from '../src/types';

function readResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
}

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const config = {
    api_key: 'test_api_key',
    organization: 'test',
    tools: ['codeql'],
  };

  test('spec', async () => {
    const source = new sut.TromzoSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection - no credentials', async () => {
    const source = new sut.TromzoSource(logger);
    await expect(source.checkConnection({} as any)).resolves.toStrictEqual([
      false,
      new VError('Please provide a valid Tromzo API key'),
    ]);
  });

  test('check connection - no organization', async () => {
    const source = new sut.TromzoSource(logger);
    await expect(
      source.checkConnection({api_key: 'test_key', organization: ''} as any)
    ).resolves.toStrictEqual([
      false,
      new VError('Please provide a valid Tromzo organization'),
    ]);
  });

  test('check connection - valid credentials', async () => {
    Tromzo.instance = jest.fn().mockImplementation(() => {
      return new Tromzo(
        {
          post: jest.fn().mockResolvedValue({
            data: {data: {findings: {toolNames: ['codeql']}}},
          }),
        } as any,
        100,
        logger
      );
    });
    const source = new sut.TromzoSource(logger);
    await expect(source.checkConnection(config)).resolves.toStrictEqual([
      true,
      undefined,
    ]);
  });

  test('check connection - invalid credentials', async () => {
    Tromzo.instance = jest.fn().mockImplementation(() => {
      return new Tromzo(
        {
          post: jest.fn().mockRejectedValue(new VError('Invalid API key')),
        } as any,
        100,
        logger
      );
    });
    const source = new sut.TromzoSource(logger);
    await expect(source.checkConnection(config)).resolves.toStrictEqual([
      false,
      new VError('Failed to fetch tools from Tromzo: Invalid API key'),
    ]);
  });

  async function testStreamSlices(config: TromzoConfig): Promise<void> {
    // const searchProjects = paginate(
    //   readTestResourceAsJSON('projects/projects.json'),
    //   'values',
    //   50
    // );
    // setupJiraInstance({v2: {projects: {searchProjects}}}, true, config, logger);

    Tromzo.instance = jest.fn().mockImplementation(() => {
      return new Tromzo(
        {
          post: jest.fn().mockResolvedValue({
            data: {
              data: {findings: {toolNames: ['codeql', 'github dependabot']}},
            },
          }),
        } as any,
        100,
        logger
      );
    });
    const stream = new Findings(config, logger);
    const slices = stream.streamSlices();
    // collect slices in an array and match with snapshot
    const sliceArray = [];
    for await (const slice of slices) {
      sliceArray.push(slice);
    }
    expect(sliceArray).toMatchSnapshot();
  }

  test('findings with tools defined', async () => {
    await testStreamSlices(config);
  });

  test('findings with no tools defined', async () => {
    await testStreamSlices({...config, tools: undefined});
  });

  test('findings with empty tools', async () => {
    await testStreamSlices({...config, tools: []});
  });

  test('findings with invalid tool', async () => {
    await testStreamSlices({...config, tools: ['invalid']});
  });
});
