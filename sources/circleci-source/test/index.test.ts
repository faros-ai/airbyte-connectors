import {AxiosInstance} from 'axios';
import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import {CircleCI} from '../src/circleci/circleci';
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
    const source = new sut.CircleCISource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });
  test('check connection', async () => {
    CircleCI.instance = jest.fn().mockImplementation(() => {
      return new CircleCI(
        {
          get: jest.fn().mockResolvedValue({}),
        } as unknown as AxiosInstance,
        ['gh/huongtn'],
        ['sample-test'],
        new Date('2010-03-27T14:03:51-0800')
      );
    });

    const source = new sut.CircleCISource(logger);
    await expect(
      source.checkConnection({
        token: '',
        org_slugs: ['org_slugs'],
        repo_names: ['repo_names'],
        cutoff_days: 90,
      })
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('check connection - incorrect config', async () => {
    CircleCI.instance = jest.fn().mockImplementation(() => {
      return new CircleCI(
        null,
        ['gh/huongtn'],
        ['sample-test'],
        new Date('2010-03-27T14:03:51-0800')
      );
    });
    const source = new sut.CircleCISource(logger);
    await expect(
      source.checkConnection({
        token: '',
        org_slugs: ['org_slugs'],
        repo_names: ['repo_names'],
        cutoff_days: 90,
      })
    ).resolves.toStrictEqual([
      false,
      new VError(
        "CircleCI api request failed: Cannot read property 'get' of null"
      ),
    ]);
  });

  test('streams - projects, use full_refresh sync mode', async () => {
    const fnProjectsList = jest.fn();
    CircleCI.instance = jest.fn().mockImplementation(() => {
      return new CircleCI(
        {
          get: fnProjectsList.mockResolvedValue({
            data: readTestResourceFile('projects.json'),
          }),
        } as any,
        ['gh/huongtn'],
        ['sample-test'],
        new Date('2010-03-27T14:03:51-0800')
      );
    });
    const source = new sut.CircleCISource(logger);
    const streams = source.streams({});
    const projectsStream = streams[0];
    const projectsIter = projectsStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      {orgSlug: 'orgSlug', repoName: 'repoName'}
    );
    const projects = [];
    for await (const project of projectsIter) {
      projects.push(project);
    }
    expect(fnProjectsList).toHaveBeenCalledTimes(1);
    expect(projects).toStrictEqual([readTestResourceFile('projects.json')]);
  });

  test('streams - pipelines, use full_refresh sync mode', async () => {
    const fnPipelinesList = jest.fn();
    CircleCI.instance = jest.fn().mockImplementation(() => {
      return new CircleCI(
        {
          get: fnPipelinesList.mockResolvedValue({
            data: {
              items: readTestResourceFile('pipelines_input.json'),
              next_page_token: null,
            },
          }),
        } as any,
        ['gh/huongtn'],
        ['sample-test'],
        new Date('2010-03-27T14:03:51-0800')
      );
    });
    const source = new sut.CircleCISource(logger);
    const streams = source.streams({});

    const pipelinesStream = streams[1];
    const pipelinesIter = pipelinesStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      {orgSlug: 'orgSlug', repoName: 'repoName'}
    );
    const pipelines = [];
    for await (const pipeline of pipelinesIter) {
      pipelines.push(pipeline);
    }
    expect(fnPipelinesList).toHaveBeenCalledTimes(3);
    expect(pipelines).toStrictEqual(readTestResourceFile('pipelines.json'));
  });
});
