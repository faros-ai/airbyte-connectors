import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  sourceCheckTest,
  SyncMode,
  readTestResourceFile,
  readTestResourceAsJSON,
  readResourceFile,
  readResourceAsJSON,
} from 'faros-airbyte-cdk';
import {AzureDevOpsClient} from 'faros-airbyte-common/azure-devops';
import fs from 'fs-extra';
import {omit} from 'lodash';
import {DateTime} from 'luxon';

import {AzurePipelines} from '../src/azurepipeline';
import * as sut from '../src/index';

const azurePipelines = AzurePipelines.instance;

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  afterEach(() => {
    jest.clearAllMocks();
  });

  const source = new sut.AzurePipelineSource(logger);
  const [pipelinesStream, runsStream, releasesStream] = source.streams({
    access_token: 'XYZ',
    organization: 'org1',
    projects: ['proj1'],
  });

  const WATERMARK = '2023-03-03T18:18:11.592Z';
  const cutoffDays = 365;
  const top = 100;
  const instanceType = 'cloud';
  const project = {id: '1', name: 'proj1'};

  beforeEach(() => (AzurePipelines.instance = azurePipelines));

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('spec', async () => {
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection - no access token', async () => {
    await sourceCheckTest({
      source,
      configOrPath: {
        access_token: '',
        organization: 'organization',
        project: 'project',
        cutoff_days: cutoffDays,
      } as any,
    });
  });

  test('streams - pipelines, use full_refresh sync mode', async () => {
    AzurePipelines.instance = jest.fn().mockImplementation(() => {
      return new AzurePipelines(
        {
          pipelines: {
            listPipelines: jest
              .fn()
              .mockResolvedValue(readTestResourceFile('pipelines.json')),
          },
        } as unknown as AzureDevOpsClient,
        instanceType,
        cutoffDays,
        top,
        logger
      );
    });

    const pipelineIter = pipelinesStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      project
    );

    const pipelines = [];
    for await (const pipeline of pipelineIter) {
      pipelines.push(pipeline);
    }

    expect(pipelines).toMatchSnapshot();
  });

  test('streams - runs, use full_refresh sync mode', async () => {
    jest
      .spyOn(DateTime, 'now')
      .mockReturnValue(
        DateTime.fromISO('2022-01-01T00:00:00.000Z').setZone(
          'UTC'
        ) as DateTime<true>
      );

    AzurePipelines.instance = jest.fn().mockImplementation(() => {
      const buildsResource: any[] = readTestResourceFile('builds.json');
      const rawBuilds = buildsResource.map((b) =>
        omit(b, ['artifacts', 'jobs'])
      );
      const artifacts = buildsResource.map((b) => b.artifacts);
      const jobs = buildsResource.map((b) => ({records: b.jobs}));
      return new AzurePipelines(
        {
          build: {
            getBuild: jest
              .fn()
              .mockResolvedValueOnce(rawBuilds[0])
              .mockResolvedValueOnce(rawBuilds[1])
              .mockResolvedValueOnce(rawBuilds[2]),
            getArtifacts: jest
              .fn()
              .mockResolvedValueOnce(artifacts[0])
              .mockResolvedValueOnce(artifacts[1])
              .mockResolvedValueOnce(artifacts[2]),
            getBuildTimeline: jest
              .fn()
              .mockResolvedValueOnce(jobs[0])
              .mockResolvedValueOnce(jobs[1])
              .mockResolvedValueOnce(jobs[2]),
          },
          pipelines: {
            listRuns: jest
              .fn()
              .mockResolvedValue(readTestResourceFile('runs.json')),
          },
        } as unknown as AzureDevOpsClient,
        instanceType,
        cutoffDays,
        top,
        logger
      );
    });

    const runIter = runsStream.readRecords(SyncMode.FULL_REFRESH, undefined, {
      project,
      pipeline: {id: 1, name: 'pipeline1'},
    });

    const runs = [];
    for await (const run of runIter) {
      runs.push(run);
    }

    expect(runs).toMatchSnapshot();
  });

  test('streams - runs, fetch build with coverage', async () => {
    jest
      .spyOn(DateTime, 'now')
      .mockReturnValue(
        DateTime.fromISO('2022-01-01T00:00:00.000Z').setZone(
          'UTC'
        ) as DateTime<true>
      );

    AzurePipelines.instance = jest.fn().mockImplementation(() => {
      const runs = [readTestResourceFile('runs.json')[0]];
      const buildsResource: any[] = readTestResourceFile(
        'builds_eligible_for_coverage.json'
      );
      const rawBuilds = buildsResource.map((b) =>
        omit(b, ['artifacts', 'jobs'])
      );
      const artifacts = buildsResource.map((b) => b.artifacts);
      const jobs = buildsResource.map((b) => ({records: b.jobs}));
      return new AzurePipelines(
        {
          build: {
            getBuild: jest.fn().mockResolvedValueOnce(rawBuilds[0]),
            getArtifacts: jest.fn().mockResolvedValueOnce(artifacts[0]),
            getBuildTimeline: jest.fn().mockResolvedValueOnce(jobs[0]),
          },
          test: {
            getCodeCoverageSummary: jest
              .fn()
              .mockResolvedValue(readTestResourceFile('builds_coverage.json')),
          },
          pipelines: {
            listRuns: jest.fn().mockResolvedValue(runs),
          },
        } as unknown as AzureDevOpsClient,
        instanceType,
        cutoffDays,
        top,
        logger
      );
    });

    const runIter = runsStream.readRecords(SyncMode.FULL_REFRESH, undefined, {
      project,
      pipeline: {id: 1, name: 'pipeline1'},
    });

    const runs = [];
    for await (const run of runIter) {
      runs.push(run);
    }

    expect(runs).toMatchSnapshot();
  });

  test('streams - releases', async () => {
    const releasesData = readTestResourceFile('releases.json');
    AzurePipelines.instance = jest.fn().mockImplementation(() => {
      return new AzurePipelines(
        {
          release: {
            getReleases: jest.fn().mockResolvedValue(releasesData),
          },
        } as unknown as AzureDevOpsClient,
        instanceType,
        cutoffDays,
        top,
        logger
      );
    });

    const releaseIter = releasesStream.readRecords(
      SyncMode.INCREMENTAL,
      undefined,
      project,
      {proj1: {cutoff: new Date(WATERMARK).getTime()}}
    );

    const releases = [];
    for await (const release of releaseIter) {
      releases.push(release);
    }

    expect(releases).toMatchSnapshot();
  });
});
