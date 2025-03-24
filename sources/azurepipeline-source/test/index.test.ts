import {
  BuildReason,
  BuildResult,
  BuildStatus,
} from 'azure-devops-node-api/interfaces/BuildInterfaces';
import {CoverageDetailedSummaryStatus} from 'azure-devops-node-api/interfaces/TestInterfaces';
import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  sourceCheckTest,
  SyncMode,
} from 'faros-airbyte-cdk';
import {AzureDevOpsClient, Build} from 'faros-airbyte-common/azure-devops';
import fs from 'fs-extra';
import {omit} from 'lodash';

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

  const source = new sut.AzurePipelineSource(logger);
  const [pipelinesStream, buildsStream, releasesStream] = source.streams({
    access_token: 'XYZ',
    organization: 'org1',
    projects: ['proj1'],
  });

  const WATERMARK = '2023-03-03T18:18:11.592Z';
  const cutoffDays = 365;
  const top = 100;
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

  test('streams - builds', async () => {
    const buildsResource: Build[] = readTestResourceFile('builds.json');
    const rawBuilds = buildsResource.map((b) => omit(b, ['artifacts', 'jobs']));
    const artifacts = buildsResource.map((b) => b.artifacts);
    const jobs = buildsResource.map((b) => ({records: b.jobs}));

    AzurePipelines.instance = jest.fn().mockImplementation(() => {
      return new AzurePipelines(
        {
          build: {
            getBuilds: jest.fn().mockResolvedValue(rawBuilds),
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
        } as unknown as AzureDevOpsClient,
        cutoffDays,
        top,
        logger
      );
    });

    const buildIter = buildsStream.readRecords(
      SyncMode.INCREMENTAL,
      undefined,
      project,
      {proj1: {cutoff: new Date(WATERMARK).getTime()}}
    );

    const builds = [];
    for await (const build of buildIter) {
      builds.push(build);
    }

    expect(builds).toMatchSnapshot();
  });

  test('streams - builds with coverage', async () => {
    const buildsResource: Build[] = readTestResourceFile(
      'builds_eligible_for_coverage.json'
    );
    const build = {
      ...buildsResource[0],
      reason: BuildReason.PullRequest,
      status: BuildStatus.Completed,
      result: BuildResult.Succeeded,
      jobs: undefined,
      artifacts: undefined,
    };

    const artifacts = buildsResource.flatMap((b) => b.artifacts);
    const timeline = {records: buildsResource[0].jobs};
    const coverage = {
      ...readTestResourceFile('builds_coverage.json'),
      coverageDetailedSummaryStatus:
        CoverageDetailedSummaryStatus.CodeCoverageSuccess,
    };

    AzurePipelines.instance = jest.fn().mockImplementation(() => {
      return new AzurePipelines(
        {
          build: {
            getBuilds: jest.fn().mockResolvedValueOnce([build]),
            getArtifacts: jest.fn().mockResolvedValueOnce(artifacts),
            getBuildTimeline: jest.fn().mockResolvedValueOnce(timeline),
          },
          test: {
            getCodeCoverageSummary: jest.fn().mockResolvedValue(coverage),
          },
        } as unknown as AzureDevOpsClient,
        cutoffDays,
        top,
        logger
      );
    });

    const buildIter = buildsStream.readRecords(
      SyncMode.INCREMENTAL,
      undefined,
      project,
      {proj1: {cutoff: new Date(WATERMARK).getTime()}}
    );

    const builds = [];
    for await (const build of buildIter) {
      builds.push(build);
    }

    expect(builds).toMatchSnapshot();
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

function readResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
}

function readTestResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
}
