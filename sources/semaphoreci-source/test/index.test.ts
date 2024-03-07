import {AxiosInstance} from 'axios';
import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import * as sut from '../src/index';
import {
  MISSING_OR_INVISIBLE_RESOURCE_ERROR_MESSAGE,
  SemaphoreCI,
  UNAUTHORIZED_ERROR_MESSAGE,
} from '../src/semaphoreci/semaphoreci';

function readResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
}

function readTestResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
}

function generateLinkHeaders(first = 1, next = 0, last = 1): any {
  const baseLinkHeader = `<http://mock.com/api/v1alpha/pipelines?page=${first}>; rel="first", <http://mock.com/api/v1alpha/pipelines?page=${last}>; rel="last"`;
  const header = !next
    ? baseLinkHeader
    : `<http://mock.com/api/v1alpha/pipelines?page=${next}>; rel="next", ` +
      baseLinkHeader;

  return {
    link: header,
  };
}

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const mockAxiosError = (status): any => {
    return {
      response: {
        status: status,
      },
      message: 'Error Message',
    };
  };

  const makeSemaphoreCI = (
    httpClient,
    projectIds = [],
    startDate = new Date('2022-01-01T00:00:00Z'),
    branchNames = [],
    delay = 0,
    includeJobs = true
  ): SemaphoreCI =>
    new SemaphoreCI(
      httpClient as unknown as AxiosInstance,
      projectIds,
      startDate,
      delay,
      includeJobs,
      logger,
      branchNames
    );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('spec', async () => {
    const source = new sut.SemaphoreCISource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  describe('check connection', () => {
    test('success', async () => {
      SemaphoreCI.instance = jest
        .fn()
        .mockImplementation(() =>
          makeSemaphoreCI({get: jest.fn().mockResolvedValue({})})
        );

      const source = new sut.SemaphoreCISource(logger);
      await expect(
        source.checkConnection(readTestResourceFile('config.json'))
      ).resolves.toStrictEqual([true, undefined]);
    });

    test('failure - authentication error', async () => {
      SemaphoreCI.instance = jest.fn().mockImplementation(() =>
        makeSemaphoreCI({
          get: jest.fn().mockRejectedValue(mockAxiosError(401)),
        })
      );

      const source = new sut.SemaphoreCISource(logger);
      await expect(
        source.checkConnection(readTestResourceFile('invalid_config.json'))
      ).resolves.toStrictEqual([false, new VError(UNAUTHORIZED_ERROR_MESSAGE)]);
    });

    test('failure - missing / not visible resource', async () => {
      SemaphoreCI.instance = jest.fn().mockImplementation(() =>
        makeSemaphoreCI({
          get: jest.fn().mockRejectedValue(mockAxiosError(404)),
        })
      );

      const source = new sut.SemaphoreCISource(logger);
      await expect(
        source.checkConnection(readTestResourceFile('invalid_config.json'))
      ).resolves.toStrictEqual([
        false,
        new VError(MISSING_OR_INVISIBLE_RESOURCE_ERROR_MESSAGE),
      ]);
    });

    test('failure - unknown error', async () => {
      SemaphoreCI.instance = jest.fn().mockImplementation(() =>
        makeSemaphoreCI({
          get: jest.fn().mockRejectedValue(mockAxiosError(500)),
        })
      );

      const source = new sut.SemaphoreCISource(logger);
      await expect(
        source.checkConnection(readTestResourceFile('invalid_config.json'))
      ).resolves.toStrictEqual([
        false,
        new VError('SemaphoreCI API request failed: Error Message'),
      ]);
    });
  });

  describe('streams', () => {
    describe('projects', () => {
      test('full_refresh sync mode', async () => {
        const restClient = jest.fn();

        SemaphoreCI.instance = jest.fn().mockImplementation(() =>
          makeSemaphoreCI({
            get: restClient.mockResolvedValue({
              data: readTestResourceFile('projects.json'),
            }),
          })
        );
        const source = new sut.SemaphoreCISource(logger);
        const streams = source.streams(readTestResourceFile('config.json'));

        const projectsStreams = streams[0];
        const projectsIter = projectsStreams.readRecords(SyncMode.FULL_REFRESH);
        const projects = [];
        for await (const project of projectsIter) {
          projects.push(project);
        }

        expect(restClient).toHaveBeenCalledTimes(1);
        expect(JSON.parse(JSON.stringify(projects))).toStrictEqual(
          readTestResourceFile('projects.json')
        );
      });

      test('filtered, full_refresh sync mode', async () => {
        const restClient = jest.fn();

        SemaphoreCI.instance = jest.fn().mockImplementation(() =>
          makeSemaphoreCI(
            {
              get: restClient.mockResolvedValue({
                data: readTestResourceFile('projects.json'),
              }),
            },
            ['8c3aa2ea-8c59-4b10-83f5-d078cf788adb']
          )
        );
        const source = new sut.SemaphoreCISource(logger);
        const streams = source.streams(readTestResourceFile('config.json'));

        const projectsStreams = streams[0];
        const projectsIter = projectsStreams.readRecords(SyncMode.FULL_REFRESH);
        const projects = [];
        for await (const project of projectsIter) {
          projects.push(project);
        }

        expect(restClient).toHaveBeenCalledTimes(1);
        expect(JSON.parse(JSON.stringify(projects))).toStrictEqual(
          readTestResourceFile('projects-filtered.json')
        );
      });
    });

    describe('pipelines', () => {
      test('full_refresh sync mode', async () => {
        const restClient = jest.fn();

        SemaphoreCI.instance = jest.fn().mockImplementation(() =>
          makeSemaphoreCI({
            get: restClient
              .mockResolvedValueOnce({
                data: readTestResourceFile('projects.json'),
                headers: generateLinkHeaders(),
              })
              .mockResolvedValueOnce({
                data: readTestResourceFile('pipelines.json'),
                headers: generateLinkHeaders(),
              })
              .mockResolvedValueOnce({
                data: readTestResourceFile('pipelines-detailed.json'),
                headers: generateLinkHeaders(),
              })
              .mockResolvedValueOnce({
                data: readTestResourceFile('jobs-detailed.json')[0],
                headers: generateLinkHeaders(),
              })
              .mockResolvedValueOnce({
                data: readTestResourceFile('jobs-detailed.json')[1],
                headers: generateLinkHeaders(),
              })
              .mockResolvedValueOnce({
                data: readTestResourceFile('jobs-detailed.json')[2],
                headers: generateLinkHeaders(),
              })
              .mockResolvedValueOnce({
                data: readTestResourceFile('pipelines-detailed.json'),
                headers: generateLinkHeaders(),
              })
              .mockResolvedValueOnce({
                data: readTestResourceFile('jobs-detailed.json')[0],
                headers: generateLinkHeaders(),
              })
              .mockResolvedValueOnce({
                data: readTestResourceFile('jobs-detailed.json')[1],
                headers: generateLinkHeaders(),
              })
              .mockResolvedValueOnce({
                data: readTestResourceFile('jobs-detailed.json')[2],
                headers: generateLinkHeaders(),
              }),
          })
        );

        const source = new sut.SemaphoreCISource(logger);
        const streams = source.streams(readTestResourceFile('config.json'));

        const pipelinesStreams = streams[1];
        const pipelineIter = pipelinesStreams.readRecords(
          SyncMode.FULL_REFRESH,
          [],
          {
            projectId: 'bea7e6ed-911e-4172-80f8-7ab58b541a86',
            branchName: '',
          }
        );
        const pipelines = [];
        for await (const pipeline of pipelineIter) {
          pipelines.push(pipeline);
        }

        expect(restClient).toHaveBeenCalledTimes(10);
        expect(restClient).toHaveBeenCalledWith(
          'pipelines?page=1&project_id=bea7e6ed-911e-4172-80f8-7ab58b541a86'
        );
        expect(pipelines).toStrictEqual(
          readTestResourceFile('pipelines-converted.json')
        );
      });

      test('full_refresh sync mode - filtered start date', async () => {
        const restClient = jest.fn();

        SemaphoreCI.instance = jest.fn().mockImplementation(() =>
          makeSemaphoreCI(
            {
              get: restClient
                .mockResolvedValueOnce({
                  data: readTestResourceFile('projects.json'),
                  headers: generateLinkHeaders(),
                })
                .mockResolvedValueOnce({
                  data: readTestResourceFile('pipelines.json'),
                  headers: generateLinkHeaders(),
                })
                .mockResolvedValueOnce({
                  data: readTestResourceFile('pipelines-detailed.json'),
                  headers: generateLinkHeaders(),
                })
                .mockResolvedValueOnce({
                  data: readTestResourceFile('jobs-detailed.json')[0],
                  headers: generateLinkHeaders(),
                })
                .mockResolvedValueOnce({
                  data: readTestResourceFile('jobs-detailed.json')[1],
                  headers: generateLinkHeaders(),
                })
                .mockResolvedValueOnce({
                  data: readTestResourceFile('jobs-detailed.json')[2],
                  headers: generateLinkHeaders(),
                }),
            },
            [],
            new Date('2022-07-25T21:46:00Z')
          )
        );

        const source = new sut.SemaphoreCISource(logger);
        const streams = source.streams(readTestResourceFile('config.json'));

        const pipelinesStreams = streams[1];
        const pipelineIter = pipelinesStreams.readRecords(
          SyncMode.FULL_REFRESH,
          [],
          {
            projectId: 'bea7e6ed-911e-4172-80f8-7ab58b541a86',
            branchName: '',
          }
        );
        const pipelines = [];
        for await (const pipeline of pipelineIter) {
          pipelines.push(pipeline);
        }

        expect(restClient).toHaveBeenCalledTimes(6);
        expect(restClient).toHaveBeenCalledWith(
          'pipelines?page=1&project_id=bea7e6ed-911e-4172-80f8-7ab58b541a86'
        );
        expect(pipelines).toStrictEqual([
          readTestResourceFile('pipelines-converted.json')[0],
        ]);
      });

      test('full_refresh sync mode - filtered by branch', async () => {
        const restClient = jest.fn();

        SemaphoreCI.instance = jest.fn().mockImplementation(() =>
          makeSemaphoreCI({
            get: restClient
              .mockResolvedValueOnce({
                data: readTestResourceFile('projects.json'),
                headers: generateLinkHeaders(),
              })
              .mockResolvedValueOnce({
                data: [readTestResourceFile('pipelines.json')[0]],
                headers: generateLinkHeaders(),
              })
              .mockResolvedValueOnce({
                data: readTestResourceFile('pipelines-detailed.json'),
                headers: generateLinkHeaders(),
              })
              .mockResolvedValueOnce({
                data: readTestResourceFile('jobs-detailed.json')[0],
                headers: generateLinkHeaders(),
              })
              .mockResolvedValueOnce({
                data: readTestResourceFile('jobs-detailed.json')[1],
                headers: generateLinkHeaders(),
              })
              .mockResolvedValueOnce({
                data: readTestResourceFile('jobs-detailed.json')[2],
                headers: generateLinkHeaders(),
              }),
          })
        );

        const source = new sut.SemaphoreCISource(logger);
        const streams = source.streams(readTestResourceFile('config.json'));

        const pipelinesStreams = streams[1];
        const pipelineIter = pipelinesStreams.readRecords(
          SyncMode.FULL_REFRESH,
          [],
          {
            projectId: 'bea7e6ed-911e-4172-80f8-7ab58b541a86',
            branchName: 'main',
          }
        );
        const pipelines = [];
        for await (const pipeline of pipelineIter) {
          pipelines.push(pipeline);
        }

        expect(restClient).toHaveBeenCalledTimes(6);
        expect(restClient).toHaveBeenCalledWith(
          'pipelines?page=1&project_id=bea7e6ed-911e-4172-80f8-7ab58b541a86&branch_name=main'
        );
        expect(pipelines).toStrictEqual([
          readTestResourceFile('pipelines-converted.json')[0],
        ]);
      });

      test('full_refresh sync mode - paginated', async () => {
        const restClient = jest.fn();
        const mockGet = restClient
          .mockResolvedValueOnce({
            data: readTestResourceFile('projects.json'),
            headers: generateLinkHeaders(),
          })
          .mockResolvedValueOnce({
            data: readTestResourceFile('pipelines.json'),
            headers: generateLinkHeaders(1, 2, 2),
          })
          .mockResolvedValueOnce({
            data: readTestResourceFile('pipelines.json'),
            headers: generateLinkHeaders(1, 0, 2),
          })
          .mockResolvedValueOnce({
            data: readTestResourceFile('pipelines-detailed.json'),
            headers: generateLinkHeaders(),
          })
          .mockResolvedValueOnce({
            data: readTestResourceFile('jobs-detailed.json')[0],
            headers: generateLinkHeaders(),
          })
          .mockResolvedValueOnce({
            data: readTestResourceFile('jobs-detailed.json')[1],
            headers: generateLinkHeaders(),
          })
          .mockResolvedValueOnce({
            data: readTestResourceFile('jobs-detailed.json')[2],
            headers: generateLinkHeaders(),
          })
          .mockResolvedValueOnce({
            data: readTestResourceFile('pipelines-detailed.json'),
            headers: generateLinkHeaders(),
          })
          .mockResolvedValueOnce({
            data: readTestResourceFile('jobs-detailed.json')[0],
            headers: generateLinkHeaders(),
          })
          .mockResolvedValueOnce({
            data: readTestResourceFile('jobs-detailed.json')[1],
            headers: generateLinkHeaders(),
          })
          .mockResolvedValueOnce({
            data: readTestResourceFile('jobs-detailed.json')[2],
            headers: generateLinkHeaders(),
          })
          .mockResolvedValueOnce({
            data: readTestResourceFile('pipelines-detailed.json'),
            headers: generateLinkHeaders(),
          })
          .mockResolvedValueOnce({
            data: readTestResourceFile('jobs-detailed.json')[0],
            headers: generateLinkHeaders(),
          })
          .mockResolvedValueOnce({
            data: readTestResourceFile('jobs-detailed.json')[1],
            headers: generateLinkHeaders(),
          })
          .mockResolvedValueOnce({
            data: readTestResourceFile('jobs-detailed.json')[2],
            headers: generateLinkHeaders(),
          })
          .mockResolvedValueOnce({
            data: readTestResourceFile('pipelines-detailed.json'),
            headers: generateLinkHeaders(),
          })
          .mockResolvedValueOnce({
            data: readTestResourceFile('jobs-detailed.json')[0],
            headers: generateLinkHeaders(),
          })
          .mockResolvedValueOnce({
            data: readTestResourceFile('jobs-detailed.json')[1],
            headers: generateLinkHeaders(),
          })
          .mockResolvedValueOnce({
            data: readTestResourceFile('jobs-detailed.json')[2],
            headers: generateLinkHeaders(),
          });

        SemaphoreCI.instance = jest.fn().mockImplementation(() =>
          makeSemaphoreCI({
            get: mockGet,
          })
        );

        const source = new sut.SemaphoreCISource(logger);
        const streams = source.streams(readTestResourceFile('config.json'));

        const pipelinesStreams = streams[1];
        const pipelineIter = pipelinesStreams.readRecords(
          SyncMode.FULL_REFRESH,
          [],
          {
            projectId: 'bea7e6ed-911e-4172-80f8-7ab58b541a86',
            branchName: '',
          }
        );
        const pipelines = [];
        for await (const pipeline of pipelineIter) {
          pipelines.push(pipeline);
        }

        expect(restClient).toHaveBeenCalledTimes(19);
        expect(restClient).toHaveBeenNthCalledWith(
          2,
          'pipelines?page=1&project_id=bea7e6ed-911e-4172-80f8-7ab58b541a86'
        );
        expect(restClient).toHaveBeenNthCalledWith(
          3,
          'pipelines?page=2&project_id=bea7e6ed-911e-4172-80f8-7ab58b541a86'
        );
        expect(pipelines).toStrictEqual([
          ...readTestResourceFile('pipelines-converted.json'),
          ...readTestResourceFile('pipelines-converted.json'),
        ]);
      });
    });
  });
});
