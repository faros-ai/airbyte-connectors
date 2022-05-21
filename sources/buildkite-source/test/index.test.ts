import {AxiosInstance} from 'axios';
import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import {Buildkite} from '../src/buildkite/buildkite';
import * as sut from '../src/index';

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
    const source = new sut.BuildkiteSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });
  test('check connection', async () => {
    Buildkite.instance = jest.fn().mockImplementation(() => {
      return new Buildkite(
        null,
        {
          get: jest.fn().mockResolvedValue({}),
        } as unknown as AxiosInstance,
        new Date('2010-03-27T14:03:51-0800')
      );
    });

    const source = new sut.BuildkiteSource(logger);
    await expect(
      source.checkConnection({
        token: '',
        cutoff_days: 90,
      })
    ).resolves.toStrictEqual([true, undefined]);
  });

  // test('check connection - incorrect config', async () => {
  //   Buildkite.instance = jest.fn().mockImplementation(() => {
  //     return new Buildkite(null, null, new Date('2010-03-27T14:03:51-0800'));
  //   });
  //   const source = new sut.BuildkiteSource(logger);
  //   await expect(
  //     source.checkConnection({
  //       token: '',
  //       cutoff_days: 90,
  //     })
  //   ).resolves.toStrictEqual([
  //     false,
  //     new VError(
  //       "Please verify your token is correct. Error: Cannot read property 'get' of null"
  //     ),
  //   ]);
  // });

  test('streams - organizations, use full_refresh sync mode', async () => {
    const fnOrganizationsList = jest.fn();
    Buildkite.instance = jest.fn().mockImplementation(() => {
      return new Buildkite(
        null,
        {
          get: fnOrganizationsList.mockResolvedValue({
            data: readTestResourceFile('organizations.json'),
          }),
        } as any,
        new Date('2010-03-27T14:03:51-0800')
      );
    });
    const source = new sut.BuildkiteSource(logger);
    const streams = source.streams({});

    const organizationsStream = streams[0];
    const organizationsIter = organizationsStream.readRecords(
      SyncMode.FULL_REFRESH
    );
    const organizations = [];
    for await (const organization of organizationsIter) {
      organizations.push(organization);
    }
    expect(fnOrganizationsList).toHaveBeenCalledTimes(1);
    expect(organizations).toStrictEqual(
      readTestResourceFile('organizations.json')
    );
  });
  test('streams - pipelines, use full_refresh sync mode', async () => {
    const fnPipelinesList = jest.fn();
    Buildkite.instance = jest.fn().mockImplementation(() => {
      return new Buildkite(
        {
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
        } as any,
        null,
        new Date('2010-03-27T14:03:51-0800'),
        1000,
        'devcube'
      );
    });
    const source = new sut.BuildkiteSource(logger);
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
    Buildkite.instance = jest.fn().mockImplementation(() => {
      return new Buildkite(
        {
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
        } as any,
        {
          get: fnBuildsList.mockResolvedValue({
            data: readTestResourceFile('pipelines_all.json'),
          }),
        } as any,
        new Date('2010-03-27T14:03:51-0800'),
        1000,
        'devcube'
      );
    });
    const source = new sut.BuildkiteSource(logger);
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
