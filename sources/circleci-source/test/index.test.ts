import {AxiosInstance} from 'axios';
import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';

import {CircleCI} from '../src/circleci/circleci';
import * as sut from '../src/index';
import {StreamState} from '../src/streams/workflows';

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

  const sourceConfig = {
    token: '',
    project_names: ['project_names'],
    cutoff_days: 1000,
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
        {
          get: jest.fn().mockResolvedValue({}),
        } as unknown as AxiosInstance,
        new Date('2010-03-27T14:03:51-0800'),
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
      return new CircleCI(
        logger,
        null,
        new Date('2010-03-27T14:03:51-0800'),
        1
      );
    });
    const source = new sut.CircleCISource(logger);
    const res = await source.checkConnection(sourceConfig);

    expect(res[0]).toBe(false);
    expect(res[1]).toBeDefined();
    expect(res[1].message).toMatch(/CircleCI API request failed: Cannot read/);
  });

  test('streams - pipelines, use full_refresh sync mode', async () => {
    const fnPipelinesList = jest.fn();
    const circleCI = new CircleCI(
      logger,
      {
        get: fnPipelinesList.mockResolvedValueOnce({
          data: {
            items: readTestResourceFile('pipelines.json'),
            next_page_token: null,
          },
          status: 200,
        }),
      } as any,
      new Date('2010-03-27T14:03:51-0800'),
      1
    );
    CircleCI.instance = jest.fn().mockReturnValue(circleCI);
    const source = new sut.CircleCISource(logger);
    const stream = source.streams(sourceConfig)[0];
    const iter = stream.readRecords(SyncMode.FULL_REFRESH, undefined, {
      projectName: 'projectName',
    });
    const pipelines = [];
    for await (const pipeline of iter) {
      pipelines.push(pipeline);
    }
    expect(fnPipelinesList).toHaveBeenCalledTimes(1);
    expect(pipelines).toStrictEqual(readTestResourceFile('pipelines.json'));
  });

  test('streams - projects, use full_refresh sync mode', async () => {
    const fnProjectsList = jest.fn();
    CircleCI.instance = jest.fn().mockImplementation(() => {
      return new CircleCI(
        logger,
        {
          get: fnProjectsList.mockResolvedValue({
            data: readTestResourceFile('projects.json'),
            status: 200,
          }),
        } as any,
        new Date('2010-03-27T14:03:51-0800'),
        1
      );
    });
    const source = new sut.CircleCISource(logger);
    const stream = source.streams(sourceConfig)[1];
    const iter = stream.readRecords(SyncMode.FULL_REFRESH, undefined, {
      projectName: 'projectName',
    });
    const projects = [];
    for await (const project of iter) {
      projects.push(project);
    }
    expect(fnProjectsList).toHaveBeenCalledTimes(1);
    expect(projects).toStrictEqual([readTestResourceFile('projects.json')]);
  });

  test('streams - workflows, use full_refresh sync mode', async () => {
    const fnGet = jest.fn();
    CircleCI.instance = jest.fn().mockImplementation(() => {
      return new CircleCI(
        logger,
        {
          get: fnGet.mockImplementation(async (path: string): Promise<any> => {
            const file = path.endsWith('/job')
              ? 'jobs_input.json'
              : 'workflows_input.json';
            return {
              data: {items: readTestResourceFile(file), next_page_token: null},
              status: 200,
            };
          }),
        } as any,
        new Date('2010-03-27T14:03:51-0800'),
        1
      );
    });
    const source = new sut.CircleCISource(logger);
    const stream = source.streams(sourceConfig)[2];
    const iter = stream.readRecords(SyncMode.FULL_REFRESH, undefined, {
      pipelineId: '2b2a3332-6b7f-47e2-a121-fdc600298175',
    });
    const workflows = [];
    for await (const workflow of iter) {
      workflows.push(workflow);
    }
    expect(fnGet).toHaveBeenCalledTimes(3);
    expect(workflows).toStrictEqual(readTestResourceFile('workflows.json'));
  });

  test('streams - workflows, use incremental sync mode', async () => {
    const fnGet = jest.fn();
    CircleCI.instance = jest.fn().mockImplementation(() => {
      return new CircleCI(
        logger,
        {
          get: fnGet.mockImplementation(async (path: string): Promise<any> => {
            const file = path.endsWith('/job')
              ? 'jobs_input.json'
              : 'workflows_input.json';
            return {
              data: {items: readTestResourceFile(file), next_page_token: null},
              status: 200,
            };
          }),
        } as any,
        new Date('2023-01-02T14:03:51-0800'),
        1
      );
    });
    const source = new sut.CircleCISource(logger);
    const stream = source.streams(sourceConfig)[2];
    const iter = stream.readRecords(SyncMode.INCREMENTAL, undefined, {
      pipelineId: '2b2a3332-6b7f-47e2-a121-fdc600298175',
    });
    const workflows = [];
    let state: StreamState = {};
    for await (const workflow of iter) {
      workflows.push(workflow);
      state = stream.getUpdatedState(state, workflow);
    }
    expect(fnGet).toHaveBeenCalledTimes(2);
    expect(workflows).toStrictEqual(
      readTestResourceFile('workflows_incremental.json')
    );
    expect(state).toStrictEqual(readTestResourceFile('workflows_state.json'));
  });
});
