import axios from 'axios';
import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import * as sut from '../src/index';
import {Octopus} from '../src/octopus';

const octopusInstance = Octopus.instance;

jest.mock('axios');

const config = {
  apiKey: 'apiKey',
  apiUri: 'apiUri',
};

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
      const projectResource: any[] = readTestResourceFile('projects.json');
      return new Octopus(
        {
          get: fnProjectsFunc.mockResolvedValue({
            data: {value: projectResource},
          }),
        } as any,
        null
      );
    });
    const source = new sut.OctopusSource(logger);
    const streams = source.streams(config);

    const projectsStream = streams[0];
    const projectIter = projectsStream.readRecords(SyncMode.FULL_REFRESH);
    const projects = [];

    for await (const proj of projectIter) {
      projects.push(proj);
    }

    expect(fnProjectsFunc).toHaveBeenCalledTimes(3);
    expect(projects).toStrictEqual(readTestResourceFile('projects.json'));
  });

  test('streams - releases, use full_refresh sync mode', async () => {
    const fnReleasesFunc = jest.fn();

    Octopus.instance = jest.fn().mockImplementation(() => {
      const releasesResource: any[] = readTestResourceFile('releases.json');
      return new Octopus(
        {
          get: fnReleasesFunc.mockResolvedValue({
            data: {value: releasesResource},
          }),
        } as any,
        null
      );
    });
    const source = new sut.OctopusSource(logger);
    const streams = source.streams({} as any);

    const releasesStream = streams[0];
    const releaseIter = releasesStream.readRecords(SyncMode.FULL_REFRESH);
    const releases = [];

    for await (const rel of releaseIter) {
      releases.push(rel);
    }

    expect(fnReleasesFunc).toHaveBeenCalledTimes(3);
    expect(releases).toStrictEqual(readTestResourceFile('releases.json'));
  });

  test('channel - groups, use full_refresh sync mode', async () => {
    const channels = readTestResourceFile('channels.json');
    Octopus.instance = jest.fn().mockImplementation(() => {
      return new Octopus(
        {get: jest.fn().mockResolvedValue({data: channels})} as any,
        logger
      );
    });

    const source = new sut.OctopusSource(logger);
    const streams = source.streams({
      apiKey: '',
      apiUri: '',
    });
    const stream = streams[1];
    const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
    const items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    expect(items).toStrictEqual(channels);
  });

  test('streams - channel, use full_refresh sync mode', async () => {
    const fnChannelFunc = jest.fn();

    Octopus.instance = jest.fn().mockImplementation(() => {
      const channelsResource: any[] = readTestResourceFile('channels.json');
      return new Octopus(
        {
          get: fnChannelFunc.mockResolvedValue({
            data: {value: channelsResource},
          }),
        } as any,
        null
      );
    });
    const source = new sut.OctopusSource(logger);
    const streams = source.streams({} as any);

    const channelStream = streams[0];
    const channelIter = channelStream.readRecords(SyncMode.FULL_REFRESH);
    const channels = [];

    for await (const rel of channelIter) {
      channels.push(rel);
    }

    expect(fnChannelFunc).toHaveBeenCalledTimes(1);
    expect(channels).toStrictEqual(readTestResourceFile('channels.json'));
  });
});
