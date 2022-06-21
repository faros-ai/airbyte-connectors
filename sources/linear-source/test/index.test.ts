import {AxiosInstance} from 'axios';
import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import * as sut from '../src/index';
import {Linear} from '../src/linear/linear';

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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('spec', async () => {
    const source = new sut.LinearSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });
  test('check connection', async () => {
    Linear.instance = jest.fn().mockImplementation(() => {
      return new Linear(null);
    });

    const source = new sut.LinearSource(logger);
    await expect(
      source.checkConnection({
        token: '',
        cutoff_days: 90,
      })
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('check connection - incorrect config', async () => {
    Linear.instance = jest.fn().mockImplementation(() => {
      return new Linear(null);
    });
    const source = new sut.LinearSource(logger);
    const res = await source.checkConnection({
      token: '',
      cutoff_days: 90,
    });

    expect(res[0]).toBe(false);
    expect(res[1]).toBeDefined();
    expect(res[1].message).toMatch(
      /Please verify your token is correct. Error: Cannot read/
    );
  });

  test('streams - pipelines, use full_refresh sync mode', async () => {
    const fnPipelinesList = jest.fn();
    Linear.instance = jest.fn().mockImplementation(() => {
      return new Linear({
        request: fnPipelinesList.mockResolvedValue({
          organization: {
            pipelines: {
              edges: readTestResourceFile('pipelines_input.json'),
              pageInfo: {
                endCursor: undefined,
              },
            },
          },
        }),
      } as any);
    });
    const source = new sut.LinearSource(logger);
    const streams = source.streams({});

    const pipelinesStream = streams[1];
    const pipesIter = pipelinesStream.readRecords(SyncMode.FULL_REFRESH);
    const pipelines = [];
    for await (const pipeline of pipesIter) {
      pipelines.push(pipeline);
    }
    expect(fnPipelinesList).toHaveBeenCalledTimes(1);
    expect(pipelines).toStrictEqual(readTestResourceFile('pipelines.json'));
  });
  test('streams - builds, use full_refresh sync mode', async () => {
    const fnBuildsList = jest.fn();
    Linear.instance = jest.fn().mockImplementation(() => {
      return new Linear({
        request: fnBuildsList.mockResolvedValue({
          pipeline: {
            builds: {
              edges: readTestResourceFile('builds_input.json'),
              pageInfo: {
                endCursor: undefined,
              },
            },
          },
        }),
      } as any);
    });
    const source = new sut.LinearSource(logger);
    const streams = source.streams({});

    const buildsStream = streams[2];
    const buildsIter = buildsStream.readRecords(SyncMode.FULL_REFRESH);
    const builds = [];
    for await (const build of buildsIter) {
      builds.push(build);
    }
    expect(fnBuildsList).toHaveBeenCalledTimes(2);
    expect(builds).toStrictEqual(readTestResourceFile('builds.json'));
  });
});
