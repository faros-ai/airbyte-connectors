import {AirbyteLogger, AirbyteSpec, SyncMode} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import jenkinsClient from 'jenkins';
import {mocked} from 'ts-jest/utils';
import {VError} from 'verror';

import {JenkinsSource} from '../src/index';

jest.mock('jenkins');

function readTestResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
}

describe('index', () => {
  const logger = new AirbyteLogger();

  test('spec', async () => {
    const source = new JenkinsSource(logger);
    expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readTestResourceFile('spec.json'))
    );
  });

  test('check connection', async () => {
    mocked(jenkinsClient).mockReturnValueOnce({
      info: jest.fn().mockResolvedValue({}),
    } as any);
    mocked(jenkinsClient).mockReturnValueOnce({
      info: jest.fn().mockRejectedValue({}),
    } as any);
    const source = new JenkinsSource(logger);
    expect(
      source.checkConnection({
        user: '123',
        token: 'token',
        server_url: 'http://google.com',
      })
    ).resolves.toStrictEqual([true, undefined]);
    expect(
      source.checkConnection({
        user: '123',
        token: 'token',
        server_url: 'http://google.com',
      })
    ).resolves.toStrictEqual([
      false,
      new VError('server_url: Please verify your user/token is correct'),
    ]);
    expect(source.checkConnection({} as any)).resolves.toStrictEqual([
      false,
      new VError('server_url: must be a string'),
    ]);
    expect(
      source.checkConnection({server_url: '111', user: '', token: ''})
    ).resolves.toStrictEqual([
      false,
      new VError('server_url: must be a valid url'),
    ]);
  });

  test('streams - jobs, use incremental sync mode', async () => {
    mocked(jenkinsClient).mockReturnValue({
      info: jest.fn().mockResolvedValue({}),
      job: {
        list: jest.fn().mockImplementation(async () =>
          readTestResourceFile('jobs.json')
        ),
      },
    } as any);
    const source = new JenkinsSource(logger);
    const [jobStream] = source.streams({
      server_url: 'http://localhost:8080',
      user: 'bot',
      token: 'pass',
    });
    const jobsIter = jobStream.readRecords(SyncMode.INCREMENTAL, undefined, {
      url: 'http://localhost:8080/job/first',
    });
    const jobs = [];
    for await (const job of jobsIter) {
      jobs.push(job);
    }
    expect(jobs).toStrictEqual([]);
  });

  test('streams - jobs, use full_refresh sync mode', async () => {
    const fnJobList = jest.fn();

    mocked(jenkinsClient).mockReturnValue({
      info: jest.fn().mockResolvedValue({}),
      job: {
        list: fnJobList.mockImplementation(async () =>
          readTestResourceFile('jobs.json')
        ),
      },
    } as any);
    const source = new JenkinsSource(logger);
    const streams = source.streams({
      server_url: 'http://localhost:8080',
      user: 'bot',
      token: 'pass',
    });
    const jobsIter = streams[0].readRecords(SyncMode.FULL_REFRESH);
    const jobs = [];
    for await (const job of jobsIter) {
      jobs.push(job);
    }
    expect(fnJobList).toHaveBeenCalledTimes(3);
    expect(jobs).toStrictEqual([
      {
        _class: 'hudson.model.FreeStyleProject',
        fullName: 'first',
        name: 'first',
        url: 'http://localhost:8080/job/first',
        allBuilds: [
          {
            building: false,
            id: '3',
            number: 3,
            url: 'http://localhost:8080/job/first',
          },
          {
            building: false,
            id: '1',
            number: 1,
            url: 'http://localhost:8080/job/first',
          },
        ],
      },
    ]);
  });

  test('streams - return undefined if config not correct', async () => {
    mocked(jenkinsClient).mockReturnValue({
      info: jest.fn().mockResolvedValue({}),
    } as any);
    const source = new JenkinsSource(logger);
    const [jobStream, buildStream] = source.streams({} as any);
    const jobIter = jobStream.readRecords(SyncMode.FULL_REFRESH);
    const buildIter = buildStream.readRecords(SyncMode.FULL_REFRESH);
    expect((await jobIter.next()).value).toBeUndefined();
    expect((await buildIter.next()).value).toBeUndefined();
  });

  test('streams - builds, use incremental sync mode', async () => {
    mocked(jenkinsClient).mockReturnValue({
      info: jest.fn().mockResolvedValue({}),
      job: {
        list: jest
          .fn()
          .mockImplementation(async () => readTestResourceFile('jobs.json')),
      },
    } as any);
    const source = new JenkinsSource(logger);
    const [, buildStream] = source.streams({
      server_url: 'http://localhost:8080',
      user: 'bot',
      token: 'pass',
    });
    const buildState = {
      newJobsLastCompletedBuilds: {first: 2},
    };
    const buildsIter = buildStream.readRecords(
      SyncMode.INCREMENTAL,
      undefined,
      undefined,
      buildState
    );
    const builds = [];
    expect(
      buildStream.getUpdatedState(buildState, {jobFullName: 'first', number: 1})
    ).toStrictEqual({
      newJobsLastCompletedBuilds: {first: 2},
    });
    for await (const build of buildsIter) {
      builds.push(build);
    }
    expect(builds).toStrictEqual([
      {
        building: false,
        id: '3',
        jobFullName: 'first',
        number: 3,
        url: 'http://localhost:8080/job/first',
      },
    ]);
    expect(
      buildStream.getUpdatedState(buildState, {jobFullName: 'first', number: 3})
    ).toStrictEqual({
      newJobsLastCompletedBuilds: {first: 3},
    });
  });

  test('streams - builds, use full_refresh sync mode', async () => {
    mocked(jenkinsClient).mockReturnValue({
      info: jest.fn().mockResolvedValue({}),
      job: {
        list: jest
          .fn()
          .mockImplementation(async () => readTestResourceFile('jobs.json')),
      },
    } as any);
    const source = new JenkinsSource(logger);
    const [, buildStream] = source.streams({
      server_url: 'http://localhost:8080',
      user: 'bot',
      token: 'pass',
    });
    const buildsIter = buildStream.readRecords(SyncMode.FULL_REFRESH);
    const builds = [];
    for await (const build of buildsIter) {
      builds.push(build);
    }
    expect(builds).toStrictEqual([
      {
        building: false,
        id: '3',
        jobFullName: 'first',
        number: 3,
        url: 'http://localhost:8080/job/first',
      },
      {
        building: false,
        id: '1',
        jobFullName: 'first',
        number: 1,
        url: 'http://localhost:8080/job/first',
      },
    ]);
  });
});
