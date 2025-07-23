import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
} from 'faros-airbyte-cdk';
import {
  readResourceAsJSON,
  sourceSchemaTest,
} from 'faros-airbyte-testing-tools';

import {Gerrit} from '../src/gerrit';
import * as sut from '../src/index';

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const source = new sut.GerritSource(logger);

  afterEach(() => {
    jest.restoreAllMocks();
    (Gerrit as any).instance_ = undefined;
  });

  test('spec', async () => {
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceAsJSON('spec.json'))
    );
  });

  test('check connection - valid config', async () => {
    const config = {
      url: 'https://gerrit.example.com',
      authentication: {
        type: 'http_password' as const,
        username: 'testuser',
        password: 'testpass',
      },
    };

    // Mock Gerrit API call
    const mockGetProjects = jest.fn().mockResolvedValue({
      'test-project': {
        id: 'test-project',
        description: 'Test project',
      },
    });

    jest.spyOn(Gerrit, 'instance').mockResolvedValue({
      getProjects: mockGetProjects,
    } as any);

    const [success, error] = await source.checkConnection(config);
    expect(success).toBe(true);
    expect(error).toBeUndefined();
    expect(mockGetProjects).toHaveBeenCalledWith({limit: 1});
  });

  test('check connection - invalid config', async () => {
    const config = {
      url: 'https://invalid-gerrit.com',
      authentication: {
        type: 'http_password' as const,
        username: 'bad',
        password: 'bad',
      },
    };

    jest
      .spyOn(Gerrit, 'instance')
      .mockRejectedValue(new Error('Authentication failed'));

    const [success, error] = await source.checkConnection(config);
    expect(success).toBe(false);
    expect(error).toBeDefined();
    expect(error?.message).toContain('Authentication failed');
  });

  sourceSchemaTest(source, readResourceAsJSON('spec.json'));
});
