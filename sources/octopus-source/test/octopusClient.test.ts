import axios from 'axios';
import {AirbyteLogger, AirbyteLogLevel} from 'faros-airbyte-cdk';

import * as sut from '../src/octopusClient';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('index', () => {
  const logger = new AirbyteLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const config: sut.OctopusClientConfig = {
    apiKey: 'key',
    instanceUrl: 'http://www.test.com',
    pageSize: 1,
    maxRetries: 0,
    logger: logger,
  };

  const mockGet = jest.fn();
  const mockApi = {
    get: mockGet,
    request: jest.fn(),
  } as any;

  beforeAll(() => {
    mockedAxios.create.mockReturnValue(mockApi);
  });

  afterEach(() => {
    mockGet.mockReset();
  });

  test('client correctly paginates', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        LastPageNumber: 1,
        Items: [
          {
            Id: 'Deployments-1',
          },
          {
            Id: 'Deployments-2',
          },
        ],
      },
    });
    mockGet.mockResolvedValueOnce({
      data: {
        LastPageNumber: 1,
        Items: [
          {
            Id: 'Deployments-3',
          },
        ],
      },
    });
    const client = new sut.OctopusClient(config);
    const deployments = await toArray(client.listDeployments('test'));
    expect(deployments.length).toEqual(3);
    expect(mockGet).toBeCalledTimes(2);
    expect(deployments).toEqual(
      expect.arrayContaining([
        {Id: 'Deployments-1'},
        {Id: 'Deployments-2'},
        {Id: 'Deployments-3'},
      ])
    );
  });
});

async function toArray<T>(asyncIterator: AsyncGenerator<T>): Promise<T[]> {
  const arr: T[] = [];
  for await (const i of asyncIterator) arr.push(i);
  return arr;
}
