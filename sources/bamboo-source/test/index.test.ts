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

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('index', () => {
  test('ok?', async () => {
    expect('OK').toEqual('OK');
  });
});

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

  test('streams - environemts, use full_refresh sync mode', async () => {
    const fnEnvironmentsFunc = jest.fn();

    Bamboo.instance = jest.fn().mockImplementation(() => {
      const environmentsResource: any[] =
        readTestResourceFile('environments.json');
      return new Bamboo(
        {
          get: fnEnvironmentsFunc.mockResolvedValue({
            data: environmentsResource,
          }),
        } as any,
        {} as BambooConfig
      );
    });
    const source = new sut.BambooSource(logger);
    const streams = source.streams({} as any);

    const environmentsStream = streams[0];
    const environmentIter = environmentsStream.readRecords(
      SyncMode.FULL_REFRESH
    );
    const environments = [];
    for await (const environment of environmentIter) {
      environments.push(environment);
    }

    expect(fnEnvironmentsFunc).toHaveBeenCalledTimes(4);
    expect(environments).toStrictEqual(
      readTestResourceFile('environments.json')
    );
  });
});
