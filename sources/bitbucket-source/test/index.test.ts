import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import {Bitbucket} from '../src/bitbucket/bitbucket';
import * as sut from '../src/index';

const bitbucketInstance = Bitbucket.instance;

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
    Bitbucket.instance = bitbucketInstance;
  });

  test('spec', async () => {
    const source = new sut.BitbucketSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection', async () => {
    Bitbucket.instance = jest.fn().mockImplementation(() => {
      return new Bitbucket(
        {workspaces: {getWorkspaces: jest.fn().mockResolvedValue({})}} as any,
        100,
        logger,
        new Date('2010-03-27T14:03:51-0800')
      );
    });

    const source = new sut.BitbucketSource(logger);
    await expect(
      source.checkConnection({
        username: 'username',
        password: 'password',
        workspaces: ['workspace'],
        cutoff_days: 90,
      })
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('check connection - rejected', async () => {
    Bitbucket.instance = jest.fn().mockImplementation(() => {
      return new Bitbucket(
        {
          workspaces: {
            getWorkspaces: jest.fn().mockRejectedValue(new Error('some error')),
          },
        } as any,
        100,
        logger,
        new Date('2010-03-27T14:03:51-0800')
      );
    });
    const source = new sut.BitbucketSource(logger);
    await expect(source.checkConnection({} as any)).resolves.toStrictEqual([
      false,
      new VError(
        'Please verify your credentials are correct. Error: some error'
      ),
    ]);
  });

  test('check connection - invalid credentials', async () => {
    const source = new sut.BitbucketSource(logger);
    await expect(source.checkConnection({} as any)).resolves.toStrictEqual([
      false,
      new VError(
        'Invalid authentication details. Please provide either only the ' +
          'Bitbucket access token or Bitbucket username and password'
      ),
    ]);
  });

  test('streams - branches, use full_refresh sync mode', async () => {
    const fnBranchesFunc = jest.fn();

    Bitbucket.instance = jest.fn().mockImplementation(() => {
      return new Bitbucket(
        {
          repositories: {
            listBranches: fnBranchesFunc.mockResolvedValue({
              data: {values: readTestResourceFile('branches.json')},
            }),
          },
          hasNextPage: jest.fn(),
        } as any,
        100,
        logger,
        new Date('2010-03-27T14:03:51-0800')
      );
    });
    const source = new sut.BitbucketSource(logger);
    const streams = source.streams({} as any);

    const branchesStream = streams[0];
    const branchesIter = branchesStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      {workspace: 'workspace', repository: 'repository'}
    );
    const branches = [];
    for await (const branch of branchesIter) {
      branches.push(branch);
    }

    expect(fnBranchesFunc).toHaveBeenCalledTimes(1);
    expect(JSON.parse(JSON.stringify(branches))).toStrictEqual(
      readTestResourceFile('branches-response.json')
    );
  });

  test('streams - deployments, use full_refresh sync mode', async () => {
    const fnDeploymentsFunc = jest.fn();

    Bitbucket.instance = jest.fn().mockImplementation(() => {
      return new Bitbucket(
        {
          deployments: {
            getEnvironment: fnDeploymentsFunc.mockImplementation(
              async ({environment_uuid: envID}: {environment_uuid: string}) => {
                const environments: any[] =
                  readTestResourceFile('environments.json');

                return {
                  data: environments.find((e) => e.uuid === envID),
                };
              }
            ),
            list: jest.fn().mockResolvedValue({
              data: {values: readTestResourceFile('deployments.json')},
            }),
          },
          hasNextPage: jest.fn(),
        } as any,
        100,
        logger,
        new Date('2010-03-27T14:03:51-0800')
      );
    });
    const source = new sut.BitbucketSource(logger);
    const streams = source.streams({} as any);

    const deploymentsStream = streams[2];
    const deploymentsIter = deploymentsStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      {workspace: 'workspace', repository: 'repository'}
    );
    const deployments = [];
    for await (const deployment of deploymentsIter) {
      deployments.push(deployment);
    }

    expect(fnDeploymentsFunc).toHaveBeenCalledTimes(2);
    expect(JSON.parse(JSON.stringify(deployments))).toStrictEqual(
      readTestResourceFile('deployments-response.json')
    );
  });

  test('streams - pipelines, use full_refresh sync mode', async () => {
    const fnPipelinesFunc = jest.fn();

    Bitbucket.instance = jest.fn().mockImplementation(() => {
      return new Bitbucket(
        {
          pipelines: {
            list: fnPipelinesFunc.mockResolvedValue({
              data: {values: readTestResourceFile('pipelines.json')},
            }),
          },
          hasNextPage: jest.fn(),
        } as any,
        100,
        logger,
        new Date('2010-03-27T14:03:51-0800')
      );
    });
    const source = new sut.BitbucketSource(logger);
    const streams = source.streams({} as any);

    const pipelinesStream = streams[4];
    const pipelinesIter = pipelinesStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      {workspace: 'workspace', repository: 'repository'}
    );
    const pipelines = [];
    for await (const pipeline of pipelinesIter) {
      pipelines.push(pipeline);
    }

    expect(fnPipelinesFunc).toHaveBeenCalledTimes(1);
    expect(JSON.parse(JSON.stringify(pipelines))).toStrictEqual(
      readTestResourceFile('pipelines-response.json')
    );
  });
  test('streams - pipelineSteps, use full_refresh sync mode', async () => {
    const fnPipelineStepsFunc = jest.fn();

    Bitbucket.instance = jest.fn().mockImplementation(() => {
      return new Bitbucket(
        {
          pipelines: {
            listSteps: fnPipelineStepsFunc.mockResolvedValue({
              data: {values: readTestResourceFile('pipelineSteps.json')},
            }),
          },
          hasNextPage: jest.fn(),
        } as any,
        100,
        logger,
        new Date('2010-03-27T14:03:51-0800')
      );
    });
    const source = new sut.BitbucketSource(logger);
    const streams = source.streams({} as any);

    const pipelineStepsStream = streams[5];
    const pipelineStepsIter = pipelineStepsStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      {workspace: 'workspace', repository: 'repository', pipeline: 'pipeline'}
    );
    const pipelineSteps = [];
    for await (const pipelineStep of pipelineStepsIter) {
      pipelineSteps.push(pipelineStep);
    }

    expect(fnPipelineStepsFunc).toHaveBeenCalledTimes(1);
    expect(JSON.parse(JSON.stringify(pipelineSteps))).toStrictEqual(
      readTestResourceFile('pipelineSteps-response.json')
    );
  });
  test('streams - repositories, use full_refresh sync mode', async () => {
    const fnRepositoriesFunc = jest.fn();

    Bitbucket.instance = jest.fn().mockImplementation(() => {
      return new Bitbucket(
        {
          repositories: {
            list: fnRepositoriesFunc.mockResolvedValue({
              data: {values: readTestResourceFile('repositories.json')},
            }),
          },
          hasNextPage: jest.fn(),
        } as any,
        100,
        logger,
        new Date('2010-03-27T14:03:51-0800')
      );
    });
    const source = new sut.BitbucketSource(logger);
    const streams = source.streams({} as any);

    const repositoriesStream = streams[8];
    const repositoriesIter = repositoriesStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      {workspace: 'workspace'}
    );
    const repositories = [];
    for await (const repository of repositoriesIter) {
      repositories.push(repository);
    }

    expect(fnRepositoriesFunc).toHaveBeenCalledTimes(1);
    expect(JSON.parse(JSON.stringify(repositories))).toStrictEqual(
      readTestResourceFile('repositories-response.json')
    );
  });
  test('streams - workspaces, use full_refresh sync mode', async () => {
    const fnWorkspacesFunc = jest.fn();

    Bitbucket.instance = jest.fn().mockImplementation(() => {
      return new Bitbucket(
        {
          workspaces: {
            getWorkspaces: fnWorkspacesFunc.mockResolvedValue({
              data: {values: readTestResourceFile('workspaces.json')},
            }),
          },
          hasNextPage: jest.fn(),
        } as any,
        100,
        logger,
        new Date('2010-03-27T14:03:51-0800')
      );
    });
    const source = new sut.BitbucketSource(logger);
    const streams = source.streams({} as any);

    const workspacesStream = streams[10];
    const workspacesIter = workspacesStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined
    );
    const workspaces = [];
    for await (const workspace of workspacesIter) {
      workspaces.push(workspace);
    }

    expect(fnWorkspacesFunc).toHaveBeenCalledTimes(1);
    expect(JSON.parse(JSON.stringify(workspaces))).toStrictEqual(
      readTestResourceFile('workspaces-response.json')
    );
  });
});
