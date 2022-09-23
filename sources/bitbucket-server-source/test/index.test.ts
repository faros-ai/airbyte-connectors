import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import {BitbucketServer} from '../src/bitbucket-server';
import {Prefix as MEP} from '../src/bitbucket-server/more-endpoint-methods';
import * as sut from '../src/index';

function readResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
}

describe('index', () => {
  const logger = new AirbyteLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  test('spec', async () => {
    const source = new sut.BitbucketServerSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection - invalid', async () => {
    const source = new sut.BitbucketServerSource(logger);
    await expect(source.checkConnection({} as any)).resolves.toStrictEqual([
      false,
      new VError('server_url must be a valid url'),
    ]);
  });

  test('check connection', async () => {
    BitbucketServer.instance = jest.fn().mockImplementation(() => {
      return new BitbucketServer(
        {api: {getUsers: jest.fn().mockResolvedValue({})}} as any,
        100,
        logger,
        new Date('2010-03-27T14:03:51-0800')
      );
    });

    const source = new sut.BitbucketServerSource(logger);
    await expect(
      source.checkConnection({
        server_url: 'localhost',
        token: 'token',
        projects: ['PLAYG'],
        cutoff_days: 90,
      })
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('streams - projects, use full_refresh sync mode', async () => {
    const fnProjectsFunc = jest.fn();
    const testProject = {key: 'PROJ1', name: 'Project1'};

    BitbucketServer.instance = jest.fn().mockImplementation(() => {
      return new BitbucketServer(
        {
          [MEP]: {
            projects: {
              getProject: fnProjectsFunc.mockResolvedValue({
                data: testProject,
              }),
            },
          },
          hasNextPage: jest.fn(),
        } as any,
        100,
        logger,
        new Date('2010-03-27T14:03:51-0800')
      );
    });
    const source = new sut.BitbucketServerSource(logger);
    const streams = source.streams({} as any);
    const projectsStream = streams[2];
    const iter = projectsStream.readRecords(SyncMode.FULL_REFRESH, undefined, {
      project: 'PROJ1',
    });
    const projects = [];
    for await (const project of iter) {
      projects.push(project);
    }
    expect(fnProjectsFunc).toHaveBeenCalledTimes(1);
    expect(JSON.parse(JSON.stringify(projects))).toStrictEqual([testProject]);
  });
});
