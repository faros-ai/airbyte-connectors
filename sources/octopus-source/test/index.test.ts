import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';

import * as sut from '../src/index';
import {Octopus} from '../src/octopus';

const iterArray = async function* (arr) {
  for (const i of arr) {
    yield i;
  }
};

describe('index', () => {
  const logger = new AirbyteLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const spacesResource = readTestResourceFile('spaces.json');
  const mockListSpaces = jest.fn().mockReturnValue(iterArray(spacesResource));
  const mockListDeployments = jest.fn();
  const mockListReleases = jest.fn();
  const mockGetProject = jest.fn();
  const mockGetEnvironment = jest.fn();
  const mockOctopusClient = {
    listSpaces: mockListSpaces,
    listDeployments: mockListDeployments,
    listReleases: mockListReleases,
    getProject: mockGetProject,
    getEnvironment: mockGetEnvironment,
  } as any;

  beforeAll(async () => {
    const octopus = new Octopus(mockOctopusClient, logger);
    await octopus.initialize(['Test']);
    Octopus.instance = jest.fn().mockImplementation(() => {
      return Promise.resolve(octopus);
    });
  });

  function readResourceFile(fileName: string): any {
    return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
  }

  function readTestResourceFile(fileName: string): any {
    return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
  }

  test('spec', async () => {
    const source = new sut.OctopusSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  // TODO: Test check connection

  test('streams - deployments, use full_refresh sync mode', async () => {
    mockListDeployments.mockReturnValue(
      iterArray(readTestResourceFile('deploymentsResponse.json'))
    );
    mockGetProject.mockResolvedValue(readTestResourceFile('project.json'));
    mockGetEnvironment.mockResolvedValue(
      readTestResourceFile('environment.json')
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
    expect(mockGetEnvironment).toBeCalledTimes(2);
    expect(mockGetProject).toBeCalledTimes(2);
    expect(deployments).toStrictEqual(readTestResourceFile('deployments.json'));
  });

  test('streams - releases, use full_refresh sync mode', async () => {
    mockListReleases.mockReturnValue(
      iterArray(readTestResourceFile('releases.json'))
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
    expect(releases).toStrictEqual(readTestResourceFile('releases.json'));
  });
});
