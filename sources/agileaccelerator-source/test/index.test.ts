import axios from 'axios';
import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import {Agileaccelerator} from '../src/agileaccelerator/agileaccelerator';
import * as sut from '../src/index';

const agileacceleratorInstance = Agileaccelerator.instance;

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

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
    Agileaccelerator.instance = agileacceleratorInstance;
    mockedAxios.post.mockResolvedValue({
      data: {access_token: 'token', tokenType: 'Bearer'},
    });
  });

  test('spec', async () => {
    const source = new sut.AgileacceleratorSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readTestResourceFile('spec.json'))
    );
  });

  test('check connection', async () => {
    Agileaccelerator.instance = jest.fn().mockImplementation(() => {
      return new Agileaccelerator(
        {get: jest.fn().mockResolvedValue({})} as any,
        'baseUrl',
        100
      );
    });

    const source = new sut.AgileacceleratorSource(logger);
    await expect(
      source.checkConnection({
        server_url: 'server_url',
        client_id: 'client_id',
        client_secret: 'client_secret',
        username: 'username',
        password: 'password',
        api_token: 'api_token',
      })
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('check connection - incorrect credentials', async () => {
    mockedAxios.post.mockRejectedValue(new Error('some error'));
    Agileaccelerator.instance = jest.fn().mockImplementation(() => {
      return new Agileaccelerator({} as any, 'baseUrl', 100);
    });
    const source = new sut.AgileacceleratorSource(logger);
    await expect(
      source.checkConnection({
        server_url: 'server_url',
        client_id: 'client_id',
        client_secret: 'client_secret',
        username: 'username',
        password: 'password',
        api_token: 'api_token',
      } as any)
    ).resolves.toStrictEqual([
      false,
      new VError(
        'Please verify your credentials are correct. Error: some error'
      ),
    ]);
  });

  test('check connection - no client_secret', async () => {
    const source = new sut.AgileacceleratorSource(logger);
    await expect(
      source.checkConnection({
        server_url: 'server_url',
        client_id: 'client_id',
      } as any)
    ).resolves.toStrictEqual([
      false,
      new VError('client_secret must be a not empty string'),
    ]);
  });

  test('streams - works, use full_refresh sync mode', async () => {
    const fnWorksFunc = jest.fn();

    Agileaccelerator.instance = jest.fn().mockImplementation(() => {
      const worksResource: any[] = readTestResourceFile('works.json');
      return new Agileaccelerator(
        {
          get: fnWorksFunc.mockResolvedValue({
            data: {totalSize: worksResource.length, records: worksResource},
          }),
        } as any,
        'baseUrl',
        100
      );
    });
    const source = new sut.AgileacceleratorSource(logger);
    const streams = source.streams({} as any);

    const worksStream = streams[0];
    const worksIter = worksStream.readRecords(SyncMode.FULL_REFRESH);
    const works = [];
    for await (const work of worksIter) {
      works.push(work);
    }

    expect(fnWorksFunc).toHaveBeenCalledTimes(1);
    expect(works).toStrictEqual(readTestResourceFile('works.json'));
  });
});
