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
import {TravisCI} from '../src/travisci/travisci';

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
    const source = new sut.TravisCISource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });
  test('check connection', async () => {
    TravisCI.instance = jest.fn().mockImplementation(() => {
      return new TravisCI(
        {
          get: jest.fn().mockResolvedValue({}),
        } as unknown as AxiosInstance,
        new Date('2010-03-27T14:03:51-0800'),
        100,
        'huongtn'
      );
    });

    const source = new sut.TravisCISource(logger);
    await expect(
      source.checkConnection({
        token: '',
        org_slug: '',
        repo_name: '',
        cutoff_days: 90,
      })
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('check connection - incorrect config', async () => {
    TravisCI.instance = jest.fn().mockImplementation(() => {
      return new TravisCI(
        null,
        new Date('2010-03-27T14:03:51-0800'),
        100,
        'huongtn'
      );
    });
    const source = new sut.TravisCISource(logger);
    await expect(
      source.checkConnection({
        token: '',
        organization: '',
        cutoff_days: 90,
      })
    ).resolves.toStrictEqual([
      false,
      new VError(
        "TravisCI api request failed: Cannot read property 'get' of null"
      ),
    ]);
  });

  test('streams - projects, use full_refresh sync mode', async () => {
    const fnProjectsList = jest.fn();
    TravisCI.instance = jest.fn().mockImplementation(() => {
      return new TravisCI(
        {
          get: fnProjectsList.mockResolvedValue({
            data: readTestResourceFile('projects.json'),
          }),
        } as any,
        new Date('2010-03-27T14:03:51-0800'),
        100,
        'huongtn'
      );
    });
    const source = new sut.TravisCISource(logger);
    const streams = source.streams({});

    const projectsStream = streams[0];
    const projectsIter = projectsStream.readRecords(SyncMode.FULL_REFRESH);
    const projects = [];
    for await (const project of projectsIter) {
      projects.push(project);
    }
    expect(fnProjectsList).toHaveBeenCalledTimes(1);
    expect(projects).toStrictEqual([readTestResourceFile('projects.json')]);
  });

  test('streams - pipelines, use full_refresh sync mode', async () => {
    const fnPipelinesList = jest.fn();
    TravisCI.instance = jest.fn().mockImplementation(() => {
      return new TravisCI(
        {
          get: fnPipelinesList.mockResolvedValue({
            data: {
              items: readTestResourceFile('pipelines_input.json'),
              next_page_token: null,
            },
          }),
        } as any,
        new Date('2010-03-27T14:03:51-0800'),
        100,
        'huongtn'
      );
    });
    const source = new sut.TravisCISource(logger);
    const streams = source.streams({});

    const pipelinesStream = streams[1];
    const pipelinesIter = pipelinesStream.readRecords(SyncMode.FULL_REFRESH);
    const pipelines = [];
    for await (const pipeline of pipelinesIter) {
      pipelines.push(pipeline);
    }
    expect(fnPipelinesList).toHaveBeenCalledTimes(3);
    expect(pipelines).toStrictEqual(readTestResourceFile('pipelines.json'));
  });
});
