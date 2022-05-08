import axios from 'axios';
import {AxiosInstance} from 'axios';
import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import {Releases} from '../lib/streams/releases';
import * as sut from '../src/index';
import {Octopus} from '../src/octopus';

const octopusInstance = Octopus.instance;

jest.mock('axios');

describe('index', () => {
  const logger = new AirbyteLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  beforeEach(() => {
    Octopus.instance = octopusInstance;
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

  test('check connection - no apiKey', async () => {
    const source = new sut.OctopusSource(logger);
    await expect(
      source.checkConnection({
        apiKey: 'apiKey',
        apiUri: 'apiUri',
      } as any)
    ).resolves.toStrictEqual([
      false,
      new VError(
        "apiKey and apiUri must be a not empty string. Error: Cannot read property 'get' of undefined"
      ),
    ]);
  });

  test('streams - project, use full_refresh sync mode', async () => {
    const fnProjectsFunc = jest.fn();

    Octopus.instance = jest.fn().mockImplementation(() => {
      const projectResource: any[] = readTestResourceFile(
        'projects_response.json'
      );
      return new Octopus(
        {
          get: fnProjectsFunc.mockResolvedValue({data: projectResource}),
        } as any,
        logger
      );
    });
    const source = new sut.OctopusSource(logger);
    const streams = source.streams({} as any);
    const projectsStream = streams[1];
    const projectIter = projectsStream.readRecords(SyncMode.FULL_REFRESH);
    const projects = [];

    for await (const proj of projectIter) {
      projects.push(proj);
    }

    expect(fnProjectsFunc).toHaveBeenCalledTimes(2);
    expect(projects).toStrictEqual(readTestResourceFile('projects.json'));
  });

  test('streams - releases, use full_refresh sync mode', async () => {
    const fnReleasesFunc = jest.fn();

    Octopus.instance = jest.fn().mockImplementation(() => {
      const releasesResource: any[] = readTestResourceFile(
        'releases_response.json'
      );
      return new Octopus(
        {
          get: fnReleasesFunc.mockResolvedValue({data: releasesResource}),
        } as any,
        logger
      );
    });

    const source = new sut.OctopusSource(logger);
    const streams = source.streams({} as any);

    const releasesStream = streams[0];
    const releaseIter = releasesStream.readRecords(SyncMode.FULL_REFRESH);
    const releases = [];

    for await (const chunk of releaseIter) {
      releases.push(chunk);
    }

    expect(fnReleasesFunc).toHaveBeenCalledTimes(2);
    expect(releases).toStrictEqual(readTestResourceFile('releases.json'));
  });

  test('streams - channel, use full_refresh sync mode', async () => {
    const fnChannelFunc = jest.fn();

    Octopus.instance = jest.fn().mockImplementation(() => {
      const channelsResource: any[] = readTestResourceFile(
        'channels_response.json'
      );
      return new Octopus(
        {
          get: fnChannelFunc.mockResolvedValue({data: channelsResource}),
        } as any,
        logger
      );
    });
    const source = new sut.OctopusSource(logger);
    const streams = source.streams({} as any);

    const channelStream = streams[2];
    const channelIter = channelStream.readRecords(SyncMode.FULL_REFRESH);
    const channels = [];

    for await (const rel of channelIter) {
      channels.push(rel);
    }

    expect(fnChannelFunc).toHaveBeenCalledTimes(2);
    expect(channels).toStrictEqual(readTestResourceFile('channels.json'));
  });

  test('streams - deployments, use full_refresh sync mode', async () => {
    const fnDeploymentFunc = jest.fn();

    Octopus.instance = jest.fn().mockImplementation(() => {
      const deploymentsResource: any[] = readTestResourceFile(
        'deployments_response.json'
      );
      return new Octopus(
        {
          get: fnDeploymentFunc.mockResolvedValue({data: deploymentsResource}),
        } as any,
        logger
      );
    });
    const source = new sut.OctopusSource(logger);
    const streams = source.streams({} as any);

    const deploymentStream = streams[3];
    const deploymentIter = deploymentStream.readRecords(SyncMode.FULL_REFRESH);
    const deployments = [];

    for await (const rel of deploymentIter) {
      deployments.push(rel);
    }

    expect(fnDeploymentFunc).toHaveBeenCalledTimes(2);
    expect(deployments).toStrictEqual(readTestResourceFile('deployments.json'));
  });
});
