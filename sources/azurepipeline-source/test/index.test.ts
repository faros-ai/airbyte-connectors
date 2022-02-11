import axios from 'axios';
import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import {AzurePipeline} from '../src/azurepipeline';
import * as sut from '../src/index';

const azureActivePipeline = AzurePipeline.instance;

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
    AzurePipeline.instance = azureActivePipeline;
  });

  function readTestResourceFile(fileName: string): any {
    return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
  }

  test('spec', async () => {
    const source = new sut.AzurePipelineSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readTestResourceFile('spec.json'))
    );
  });

  test('check connection - no client_secret', async () => {
    const source = new sut.AzurePipelineSource(logger);
    await expect(
      source.checkConnection({
        client_id: 'client_id',
        tenant_id: 'tenant_id',
      } as any)
    ).resolves.toStrictEqual([
      false,
      new VError('client_secret must be a not empty string'),
    ]);
  });

  test('streams - pipelines, use full_refresh sync mode', async () => {
    const fnPipelinesFunc = jest.fn();

    AzurePipeline.instance = jest.fn().mockImplementation(() => {
      const pipelinesResource: any[] = readTestResourceFile('pipelines.json');
      return new AzurePipeline(
        {
          get: fnPipelinesFunc.mockResolvedValue({
            data: {value: pipelinesResource},
          }),
        } as any,
        null
      );
    });
    const source = new sut.AzurePipelineSource(logger);
    const streams = source.streams({} as any);

    const pipelinesStream = streams[0];
    const pipelineIter = pipelinesStream.readRecords(SyncMode.FULL_REFRESH);
    const pipelines = [];
    for await (const pipeline of pipelineIter) {
      pipelines.push(pipeline);
    }

    expect(fnPipelinesFunc).toHaveBeenCalledTimes(5);
    expect(pipelines).toStrictEqual(readTestResourceFile('pipelines.json'));
  });
});
