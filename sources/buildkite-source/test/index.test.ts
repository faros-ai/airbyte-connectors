import {AxiosInstance} from 'axios';
import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import {
  readResourceAsJSON,
  readTestFileAsJSON,
} from 'faros-airbyte-testing-tools';

import {Buildkite} from '../src/buildkite/buildkite';
import * as sut from '../src/index';

describe('index', () => {
  const logger = new AirbyteSourceLogger(
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
      new AirbyteSpec(readResourceAsJSON('spec.json'))
    );
  });

  const sourceConfig = {token: '', cutoff_days: 90};

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
    await expect(source.checkConnection(sourceConfig)).resolves.toStrictEqual([
      true,
      undefined,
    ]);
  });

  test('check connection - incorrect config', async () => {
    Buildkite.instance = jest.fn().mockImplementation(() => {
      return new Buildkite(null, null, new Date('2010-03-27T14:03:51-0800'));
    });
    const source = new sut.BuildkiteSource(logger);
    const res = await source.checkConnection(sourceConfig);

    expect(res[0]).toBe(false);
    expect(res[1]).toBeDefined();
    expect(res[1].message).toMatch(
      /Please verify your token is correct. Error: Cannot read/
    );
  });

  test('streams - organizations, use full_refresh sync mode', async () => {
    const fnOrganizationsList = jest.fn();
    Buildkite.instance = jest.fn().mockImplementation(() => {
      return new Buildkite(
        null,
        {
          get: fnOrganizationsList.mockResolvedValue({
            data: readTestFileAsJSON('organizations.json'),
          }),
        } as any,
        new Date('2010-03-27T14:03:51-0800')
      );
    });
    const source = new sut.BuildkiteSource(logger);
    const streams = source.streams(sourceConfig);

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
      readTestFileAsJSON('organizations.json')
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
                edges: readTestFileAsJSON('pipelines_input.json'),
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
    const streams = source.streams(sourceConfig);

    const pipelinesStream = streams[1];
    const pipesIter = pipelinesStream.readRecords(SyncMode.FULL_REFRESH);
    const pipelines = [];
    for await (const pipeline of pipesIter) {
      pipelines.push(pipeline);
    }
    expect(fnPipelinesList).toHaveBeenCalledTimes(1);
    expect(pipelines).toStrictEqual(readTestFileAsJSON('pipelines.json'));
  });
  test('streams - builds, use full_refresh sync mode', async () => {
    const fnBuildsList = jest.fn();
    Buildkite.instance = jest.fn().mockImplementation(() => {
      return new Buildkite(
        {
          request: fnBuildsList
            .mockResolvedValueOnce({
              organization: {
                pipelines: {
                  edges: readTestFileAsJSON('pipelines_input.json'),
                  pageInfo: {
                    endCursor: undefined,
                  },
                },
              },
            })
            .mockResolvedValueOnce({
              pipeline: {
                builds: {
                  edges: readTestFileAsJSON('builds_input.json'),
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
    const streams = source.streams(sourceConfig);

    const buildsStream = streams[2];
    const buildsIter = buildsStream.readRecords(SyncMode.FULL_REFRESH);
    const builds = [];
    for await (const build of buildsIter) {
      builds.push(build);
    }
    expect(fnBuildsList).toHaveBeenCalledTimes(2);
    expect(builds).toStrictEqual(readTestFileAsJSON('builds.json'));
  });
});
