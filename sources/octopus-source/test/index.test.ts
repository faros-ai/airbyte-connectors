import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import {readResourceFile} from 'faros-airbyte-common/common';
import fs from 'fs-extra';

import * as sut from '../src/index';
import {Octopus} from '../src/octopus';

const iterArray = async function* (arr) {
  for (const i of arr) {
    yield i;
  }
};

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const mockListSpaces = jest
    .fn()
    .mockReturnValue(iterArray(readTestResourceFile('spaces.json')));
  const mockListDeployments = jest.fn();
  const mockListReleases = jest.fn();
  const mockGetEnvironment = jest.fn();
  const mockGetProject = jest.fn();
  const mockGetTask = jest.fn();
  const mockGetProjectDeploymentProcess = jest.fn();
  const mockGetVariableSet = jest
    .fn()
    .mockResolvedValue(readTestResourceFile('variable_set.json'));
  const mockOctopusClient = {
    listSpaces: mockListSpaces,
    listDeployments: mockListDeployments,
    listReleases: mockListReleases,
    getEnvironment: mockGetEnvironment,
    getProject: mockGetProject,
    getTask: mockGetTask,
    getProjectDeploymentProcess: mockGetProjectDeploymentProcess,
    getVariableSet: mockGetVariableSet,
  } as any;

  beforeAll(async () => {
    const variableNames = ['Name1'];
    const octopus = new Octopus(
      mockOctopusClient,
      logger,
      undefined,
      variableNames,
      1,
      true
    );
    await octopus.initialize(['Default']);
    Octopus.instance = jest.fn().mockImplementation(() => {
      return Promise.resolve(octopus);
    });
  });

  beforeEach(() => {
    mockGetProject.mockReset();
    mockGetProject.mockResolvedValue(readTestResourceFile('project.json'));
    mockListDeployments.mockReset();
    mockGetEnvironment.mockReset();
    mockGetTask.mockReset();
    mockGetProjectDeploymentProcess.mockReset();
    mockListReleases.mockReset();
  });



  function readTestResourceFile(fileName: string): any {
    return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
  }

  test('spec', async () => {
    const source = new sut.OctopusSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection', async () => {
    const source = new sut.OctopusSource(logger);
    await expect(
      source.checkConnection({api_key: 'key', instance_url: 'url'})
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('streams - deployments, use full_refresh sync mode', async () => {
    mockListDeployments.mockReturnValue(
      iterArray(readTestResourceFile('deployments_response.json'))
    );
    mockGetEnvironment.mockResolvedValue(
      readTestResourceFile('environment.json')
    );
    const tasks = readTestResourceFile('tasks.json');
    mockGetTask.mockResolvedValueOnce(tasks[0]);
    mockGetTask.mockResolvedValueOnce(tasks[1]);
    mockGetProjectDeploymentProcess.mockResolvedValue(
      readTestResourceFile('project_deployment_process.json')
    );

    const source = new sut.OctopusSource(logger);
    const streams = source.streams({} as any);
    const deploymentsStream = streams[0];
    const deploymentsIter = deploymentsStream.readRecords(
      SyncMode.FULL_REFRESH
    );
    const deployments = [];

    for await (const deployment of deploymentsIter) {
      deployments.push(deployment);
    }

    expect(mockListDeployments).toBeCalledTimes(1);
    expect(mockGetProject).toBeCalledTimes(2);
    expect(mockGetEnvironment).toBeCalledTimes(2);
    expect(mockGetTask).toBeCalledTimes(2);
    expect(mockGetProjectDeploymentProcess).toBeCalledTimes(2);
    expect(deployments).toStrictEqual(readTestResourceFile('deployments.json'));
  });

  test('streams - deployments, use incremental sync mode', async () => {
    mockListDeployments.mockReturnValue(
      iterArray(readTestResourceFile('deployments_response.json'))
    );
    mockGetEnvironment.mockResolvedValue(
      readTestResourceFile('environment.json')
    );
    const tasks = readTestResourceFile('tasks.json');
    mockGetTask.mockResolvedValueOnce(tasks[0]);
    mockGetTask.mockResolvedValueOnce(tasks[1]);
    mockGetProjectDeploymentProcess.mockResolvedValue(
      readTestResourceFile('project_deployment_process.json')
    );

    const source = new sut.OctopusSource(logger);
    const streams = source.streams({} as any);
    const deploymentsStream = streams[0];
    const deploymentsIter = deploymentsStream.readRecords(
      SyncMode.INCREMENTAL,
      undefined,
      undefined,
      {Default: {lastDeploymentId: 'Deployments-2'}}
    );
    const deployments = [];

    for await (const deployment of deploymentsIter) {
      deployments.push(deployment);
    }

    expect(mockListDeployments).toBeCalledTimes(1);
    expect(mockGetProject).toBeCalledTimes(1);
    expect(mockGetEnvironment).toBeCalledTimes(1);
    expect(mockGetTask).toBeCalledTimes(1);
    expect(mockGetProjectDeploymentProcess).toBeCalledTimes(1);
    expect(deployments).toStrictEqual([
      readTestResourceFile('deployments.json')[0],
    ]);
  });

  test('streams - releases, use full_refresh sync mode', async () => {
    mockListReleases.mockReturnValue(
      iterArray(readTestResourceFile('releases_response.json'))
    );

    const source = new sut.OctopusSource(logger);
    const streams = source.streams({} as any);
    const releasesStream = streams[1];
    const releasesIter = releasesStream.readRecords(SyncMode.FULL_REFRESH);
    const releases = [];

    for await (const release of releasesIter) {
      releases.push(release);
    }

    expect(mockListReleases).toBeCalledTimes(1);
    expect(mockGetProject).toBeCalledTimes(2);
    expect(releases).toStrictEqual(readTestResourceFile('releases.json'));
  });

  test('streams - releases, use incremental sync mode', async () => {
    mockListReleases.mockReturnValue(
      iterArray(readTestResourceFile('releases_response.json'))
    );

    const source = new sut.OctopusSource(logger);
    const streams = source.streams({} as any);
    const releasesStream = streams[1];
    const releasesIter = releasesStream.readRecords(
      SyncMode.INCREMENTAL,
      undefined,
      undefined,
      {Default: {lastReleaseId: 'Releases-2'}}
    );
    const releases = [];

    for await (const release of releasesIter) {
      releases.push(release);
    }

    expect(mockListReleases).toBeCalledTimes(1);
    expect(mockGetProject).toBeCalledTimes(1);
    expect(releases).toStrictEqual([readTestResourceFile('releases.json')[0]]);
  });
});
