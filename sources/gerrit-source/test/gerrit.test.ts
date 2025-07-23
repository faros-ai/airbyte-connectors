import axios from 'axios';
import {AirbyteSourceLogger} from 'faros-airbyte-cdk';

import {Gerrit} from '../src/gerrit';
import {GerritConfig} from '../src/types';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Gerrit', () => {
  const logger = new AirbyteSourceLogger();

  const config: GerritConfig = {
    url: 'https://gerrit.example.com',
    authentication: {
      type: 'http_password',
      username: 'testuser',
      password: 'testpass',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (Gerrit as any).instance_ = undefined;
  });

  test('should handle Gerrit magic prefix in responses', async () => {
    const mockResponse = {
      data: ')]}\'{"test-project": {"id": "test-project"}}',
      status: 200,
    };

    const mockAxiosInstance = {
      get: jest.fn().mockResolvedValue(mockResponse),
      interceptors: {
        request: {use: jest.fn()},
        response: {use: jest.fn()},
      },
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

    new Gerrit(config, logger);

    // Test that the response interceptor is set up
    expect(mockedAxios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://gerrit.example.com/',
        headers: expect.objectContaining({
          Accept: 'application/json',
          'Content-Type': 'application/json',
        }),
        auth: {
          username: 'testuser',
          password: 'testpass',
        },
      })
    );
  });

  test('should build correct auth headers for HTTP password', () => {
    new Gerrit(config, logger);

    expect(mockedAxios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: {
          username: 'testuser',
          password: 'testpass',
        },
      })
    );
  });

  test('should build correct auth headers for cookie', () => {
    const cookieConfig: GerritConfig = {
      url: 'https://gerrit.example.com',
      authentication: {
        type: 'cookie',
        cookie_value: 'session=abc123',
      },
    };

    const gerrit = new Gerrit(cookieConfig, logger);

    expect(mockedAxios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: 'session=abc123',
        }),
      })
    );
  });
});
