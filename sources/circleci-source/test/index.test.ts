import {AxiosInstance} from 'axios';
import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {Dictionary} from 'ts-essentials';

import {CircleCI, CircleCIConfig} from '../src/circleci/circleci';
import * as sut from '../src/index';

function readResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
}

function readTestResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
}

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

  const sourceConfig: CircleCIConfig = {
    token: '',
    project_slugs: [
      'gh/faros-ai/test-project',
      'gh/faros-test/test-project',
      'gh/faros-test/test-project2',
    ],
    project_block_list: ['gh/faros-test/*'],
    cutoff_days: 90,
    reject_unauthorized: true,
  };

  test('spec', async () => {
    const source = new sut.CircleCISource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection', async () => {
    CircleCI.instance = jest.fn().mockImplementation(() => {
      return new CircleCI(
        logger,
        null,
        {
          get: jest.fn().mockResolvedValue({}),
        } as unknown as AxiosInstance,
        10000,
        1
      );
    });

    const source = new sut.CircleCISource(logger);
    await expect(source.checkConnection(sourceConfig)).resolves.toStrictEqual([
      true,
      undefined,
    ]);
  });

  test('check connection - incorrect config', async () => {
    CircleCI.instance = jest.fn().mockImplementation(() => {
      return new CircleCI(logger, null, null, 10000, 1);
    });
    const source = new sut.CircleCISource(logger);
    const res = await source.checkConnection(sourceConfig);

    expect(res[0]).toBe(false);
    expect(res[1]).toBeDefined();
    expect(res[1].message).toMatch(/CircleCI API request failed: Cannot read/);
  });

  test('streams - projects, use full_refresh sync mode', async () => {
    const fnProjectsList = jest.fn();
    CircleCI.instance = jest.fn().mockImplementation(() => {
      return new CircleCI(
        logger,
        null,
        {
          get: fnProjectsList.mockResolvedValue({
            data: readTestResourceFile('projects.json'),
            status: 200,
          }),
        } as any,
        10000,
        1
      );
    });
    const source = new sut.CircleCISource(logger);
    const streams = source.streams(sourceConfig);
    const projectsStream = streams[0];
    const projectsIter = projectsStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      {projectName: sourceConfig.project_slugs[0]}
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
    const v2 = {
      get: fnPipelinesList
        .mockResolvedValueOnce({
          data: {
            items: readTestResourceFile('pipelines_input.json'),
            next_page_token: null,
          },
          status: 200,
        })
        .mockResolvedValue({
          data: {
            items: [],
            next_page_token: null,
          },
          status: 200,
        }),
    } as any;
    const circleCI = new CircleCI(logger, null, v2, 10000, 1);
    CircleCI.instance = jest.fn().mockReturnValue(circleCI);
    const source = new sut.CircleCISource(logger);
    const streams = source.streams(sourceConfig);

    const pipelinesStream = streams[1];
    const pipelinesIter = pipelinesStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      {projectName: sourceConfig.project_slugs[0]}
    );
    const pipelines = [];
    let state: Dictionary<{lastUpdatedAt?: string}> = {};
    for await (const pipeline of pipelinesIter) {
      pipelines.push(pipeline);
      state = pipelinesStream.getUpdatedState(state, pipeline);
    }
    expect(fnPipelinesList).toHaveBeenCalledTimes(5); // fetchPipelines once + 1 fetchWorkflows per pipeline
    expect(pipelines).toStrictEqual(readTestResourceFile('pipelines.json'));
    expect(state).toStrictEqual(readTestResourceFile('pipelines_state.json'));
  });

  test('streams - tests, use full_refresh sync mode', async () => {
    const fnTestsList = jest.fn();
    CircleCI.instance = jest.fn().mockImplementation(() => {
      return new CircleCI(
        logger,
        null,
        {
          get: fnTestsList
            .mockResolvedValueOnce({
              data: {
                items: readTestResourceFile('pipeline_input.json'),
                next_page_token: null,
              },
              status: 200,
            })
            .mockResolvedValueOnce({
              data: {
                items: readTestResourceFile('workflows_input.json'),
                next_page_token: null,
              },
              status: 200,
            })
            .mockResolvedValueOnce({
              data: {
                items: readTestResourceFile('jobs_input.json'),
                next_page_token: null,
              },
              status: 200,
            })
            .mockResolvedValueOnce({
              data: {
                items: readTestResourceFile('tests_input.json'),
                next_page_token: null,
              },
              status: 200,
            }),
        } as any,
        10000,
        1
      );
    });
    const source = new sut.CircleCISource(logger);
    const streams = source.streams(sourceConfig);
    const testsStream = streams[2];
    const testsIter = testsStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      {projectName: sourceConfig.project_slugs[0]}
    );
    const tests = [];
    for await (const test of testsIter) {
      tests.push(test);
    }
    expect(fnTestsList).toHaveBeenCalledTimes(4);
    expect(tests).toStrictEqual(readTestResourceFile('tests.json'));
  });

  test('filter projects', () => {
    CircleCI.instance = jest.fn().mockImplementation(() => {
      return new CircleCI(
        logger,
        null,
        {
          get: jest.fn().mockResolvedValue({}),
        } as unknown as AxiosInstance,
        10000,
        1
      );
    });

    const allProjectSlugs = [
      'GH/testingCAPS',
      'gh/blockedsubpath',
      'gh/blockedsubpath/deep/nested',
      'gh/keptsubpath',
      'gh/keptsubpath/subsubpath',
      'gh/wildcard1/wildcardsubpath',
      'gh/wildcard2/wildcardsubpath',
      'gh/wildcard2/subpath/wildcardsubpath',
      'gh/hyphen-path/subpath1',
      'gh/hyphen-path/subpath2',
      'gh/hyphen-path/subpath2/subpath',
      'gh/anotherkept/subpath',
      'gh/excluded-from-graph',
      'gh/exactpath-to-remove',
      'gh/exactpath-to-remove-suffix',
      'gh/exactpath-to-remove/keptsubpath',
      'gh/pathwildcardblock1',
      'gh/pathwildcardblock-2',
      'gh/pathwildcardblock-test',
    ];
    const blocklist = new Set([
      'gh/testingcaps',
      'gh/blockedsubpath/*',
      'gh/*/wildcardsubpath',
      'gh/hyphen-path/*',
      'gh/exactpath-to-remove',
      'gh/pathwildcardblock*',
    ]);
    const excludedRepoSlugs = new Set(['gh/excluded-from-graph']);
    const projects = sut.CircleCISource.filterBlockList(
      allProjectSlugs,
      blocklist,
      excludedRepoSlugs
    );
    expect(projects).toStrictEqual([
      'gh/blockedsubpath',
      'gh/keptsubpath',
      'gh/keptsubpath/subsubpath',
      'gh/anotherkept/subpath',
      'gh/exactpath-to-remove-suffix',
      'gh/exactpath-to-remove/keptsubpath',
    ]);
  });
});
