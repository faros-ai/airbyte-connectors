import axios from 'axios';
import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import {Bamboo, BambooConfig} from '../src/bamboo';
import * as sut from '../src/index';

const bambooInstance = Bamboo.instance;

jest.mock('axios');

describe('index', () => {
  const logger = new AirbyteLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  beforeEach(() => {
    Bamboo.instance = bambooInstance;
  });

  function readResourceFile(fileName: string): any {
    return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
  }

  function readTestResourceFile(fileName: string): any {
    return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
  }

  test('spec', async () => {
    const source = new sut.BambooSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection - no token', async () => {
    const source = new sut.BambooSource(logger);
    await expect(
      source.checkConnection({
        token: '',
        baseUrl: '',
      } as any)
    ).resolves.toStrictEqual([false, new VError('No token provided')]);
  });
  test('streams - plans, use full_refresh sync mode', async () => {
    const fnPlansFunc = jest.fn();

    Bamboo.instance = jest.fn().mockImplementation(() => {
      const plansResource: any[] = readTestResourceFile('plans_input.json');
      return new Bamboo(
        {
          get: fnPlansFunc.mockResolvedValue({
            data: plansResource,
          }),
        } as any,
        {} as BambooConfig
      );
    });
    const source = new sut.BambooSource(logger);
    const streams = source.streams({} as any);

    const plansStream = streams[2];
    const planIter = plansStream.readRecords(SyncMode.FULL_REFRESH);
    const plans = [];
    for await (const plan of planIter) {
      plans.push(plan);
    }

    expect(fnPlansFunc).toHaveBeenCalledTimes(1);
    expect(plans).toStrictEqual(readTestResourceFile('plans.json'));
  });

  test('streams - builds, use full_refresh sync mode', async () => {
    const fnBuildsFunc = jest.fn();

    Bamboo.instance = jest.fn().mockImplementation(() => {
      const buildsResource: any[] = readTestResourceFile('builds_input.json');
      return new Bamboo(
        {
          get: fnBuildsFunc.mockResolvedValue({
            data: buildsResource,
          }),
        } as any,
        {} as BambooConfig
      );
    });
    const source = new sut.BambooSource(logger);
    const streams = source.streams({} as any);

    const buildsStream = streams[0];
    const buildIter = buildsStream.readRecords(SyncMode.FULL_REFRESH);
    const builds = [];
    for await (const build of buildIter) {
      builds.push(build);
    }

    expect(fnBuildsFunc).toHaveBeenCalledTimes(2);
    expect(builds).toStrictEqual([]);
  });

  test('streams - deployment, use full_refresh sync mode', async () => {
    const fnDeploymentsFunc = jest.fn();

    Bamboo.instance = jest.fn().mockImplementation(() => {
      const deploymentsResource: any[] =
        readTestResourceFile('deployments.json');
      return new Bamboo(
        {
          get: fnDeploymentsFunc.mockResolvedValue({
            data: deploymentsResource,
          }),
        } as any,
        {} as BambooConfig
      );
    });
    const source = new sut.BambooSource(logger);
    const streams = source.streams({} as any);

    const deploymentsStream = streams[1];
    const deploymentIter = deploymentsStream.readRecords(SyncMode.FULL_REFRESH);
    const deployments = [];
    for await (const deployment of deploymentIter) {
      deployments.push(deployment);
    }

    expect(fnDeploymentsFunc).toHaveBeenCalledTimes(3);
    expect(deployments).toStrictEqual([]);
  });
});
