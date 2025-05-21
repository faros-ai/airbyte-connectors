import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  readResourceAsJSON,
  readTestFileAsJSON,
  SyncMode,
} from 'faros-airbyte-cdk';

import {Gitlab} from '../src/gitlab';
import * as sut from '../src/index';

const config = {
  token: 'token',
  groupName: 'groupName',
  projects: ['project'],
};

const gitlabInstance = Gitlab.instance;


describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  beforeEach(() => {
    Gitlab.instance = gitlabInstance;
  });

  test('spec', async () => {
    const source = new sut.GitlabCiSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceAsJSON('spec.json'))
    );
  });

  test('check connection', async () => {
    Gitlab.instance = jest.fn().mockImplementation(() => {
      return new Gitlab(
        {Version: {show: jest.fn().mockResolvedValue({})}},
        config
      );
    });

    const source = new sut.GitlabCiSource(logger);
    await expect(source.checkConnection(config)).resolves.toStrictEqual([
      true,
      undefined,
    ]);
  });

  test('check connection - incorrect config', async () => {
    const source = new sut.GitlabCiSource(logger);
    const res = await source.checkConnection(config);

    expect(res[0]).toBe(false);
    expect(res[1]).toBeDefined();
    expect(res[1].message).toStrictEqual(
      'Please verify your token is correct. Error: Response code 401 (Unauthorized)'
    );
  });
  test('streams - groups, use full_refresh sync mode', async () => {
    const fnGroupFunc = jest.fn();

    Gitlab.instance = jest.fn().mockImplementation(() => {
      return new Gitlab(
        {
          Groups: {
            show: fnGroupFunc.mockResolvedValue(
              readTestFileAsJSON('groups.json')
            ),
          },
        },
        config
      );
    });
    const source = new sut.GitlabCiSource(logger);
    const streams = source.streams(config);

    const groupStream = streams[0];
    const groupIter = groupStream.readRecords(SyncMode.FULL_REFRESH);
    const groups = [];
    for await (const group of groupIter) {
      groups.push(group);
    }

    expect(fnGroupFunc).toHaveBeenCalledTimes(1);
    expect(JSON.parse(JSON.stringify(groups))).toStrictEqual(
      readTestFileAsJSON('groups-response.json')
    );
  });
  test('streams - projects, use full_refresh sync mode', async () => {
    const fnProjectsFunc = jest.fn();

    Gitlab.instance = jest.fn().mockImplementation(() => {
      return new Gitlab(
        {
          Projects: {
            show: fnProjectsFunc.mockResolvedValue(
              readTestFileAsJSON('projects.json')
            ),
          },
          Groups: {
            show: jest
              .fn()
              .mockResolvedValue(readTestFileAsJSON('groups.json')),
          },
        },
        config
      );
    });
    const source = new sut.GitlabCiSource(logger);
    const streams = source.streams(config);

    const projectsStream = streams[1];
    const projectsIter = projectsStream.readRecords(SyncMode.FULL_REFRESH);
    const projects = [];
    for await (const project of projectsIter) {
      projects.push(project);
    }

    expect(fnProjectsFunc).toHaveBeenCalledTimes(1);
    expect(JSON.parse(JSON.stringify(projects))).toStrictEqual(
      readTestFileAsJSON('projects-response.json')
    );
  });
  test('streams - pipelines, use full_refresh sync mode', async () => {
    const fnPipelinesFunc = jest.fn();

    Gitlab.instance = jest.fn().mockImplementation(() => {
      return new Gitlab(
        {
          Pipelines: {
            all: fnPipelinesFunc.mockResolvedValue({
              data: readTestFileAsJSON('pipelines.json'),
            }),
          },
        },
        config
      );
    });
    const source = new sut.GitlabCiSource(logger);
    const streams = source.streams(config);

    const pipelinesStream = streams[2];
    const pipelinesIter = pipelinesStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      {projectPath: 'best-group/project2'}
    );
    const pipelines = [];
    for await (const pipeline of pipelinesIter) {
      pipelines.push(pipeline);
    }

    expect(fnPipelinesFunc).toHaveBeenCalledTimes(1);
    expect(JSON.parse(JSON.stringify(pipelines))).toStrictEqual(
      readTestFileAsJSON('pipelines-response.json')
    );
  });
  test('streams - pipelines, use incremental sync mode', async () => {
    const fnPipelinesFunc = jest.fn();

    Gitlab.instance = jest.fn().mockImplementation(() => {
      return new Gitlab(
        {
          Pipelines: {
            all: fnPipelinesFunc.mockResolvedValue({
              data: readTestFileAsJSON('pipelines.json'),
            }),
          },
        },
        config
      );
    });
    const source = new sut.GitlabCiSource(logger);
    const streams = source.streams(config);

    const pipelinesStream = streams[2];
    const pipelinesState = {cutoff: '2022-04-02T19:45:31.255Z'};
    const pipelinesIter = pipelinesStream.readRecords(
      SyncMode.INCREMENTAL,
      undefined,
      {projectPath: 'best-group/project2'},
      pipelinesState
    );
    const pipelines = [];
    for await (const pipeline of pipelinesIter) {
      pipelines.push(pipeline);
    }

    expect(fnPipelinesFunc).toHaveBeenCalledTimes(1);
    expect(JSON.parse(JSON.stringify(pipelines))).toStrictEqual(
      readTestFileAsJSON('pipelines-response.json')
    );
    expect(
      pipelinesStream.getUpdatedState(pipelinesState, {
        updatedAt: '2022-04-04T07:06:54.227Z',
      })
    ).toStrictEqual({
      cutoff: '2022-04-04T07:06:54.227Z',
    });
  });
  test('streams - jobs, use full_refresh sync mode', async () => {
    const fnJobsFunc = jest.fn();

    Gitlab.instance = jest.fn().mockImplementation(() => {
      return new Gitlab(
        {
          Jobs: {
            showPipelineJobs: fnJobsFunc.mockResolvedValue({
              data: readTestFileAsJSON('jobs.json'),
            }),
          },
        },
        config
      );
    });
    const source = new sut.GitlabCiSource(logger);
    const streams = source.streams(config);

    const jobsStream = streams[3];
    const jobsIter = jobsStream.readRecords(SyncMode.FULL_REFRESH, undefined, {
      projectPath: 'best-group/project2',
      pipelineId: 1,
    });
    const jobs = [];
    for await (const job of jobsIter) {
      jobs.push(job);
    }

    expect(fnJobsFunc).toHaveBeenCalledTimes(1);
    expect(JSON.parse(JSON.stringify(jobs))).toStrictEqual(
      readTestFileAsJSON('jobs-response.json')
    );
  });
});
