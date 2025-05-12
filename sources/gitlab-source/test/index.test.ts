import {AirbyteLogger, AirbyteLogLevel} from 'faros-airbyte-cdk';
import {FarosClient} from 'faros-js-client';
import {getLocal} from 'mockttp';
import {Dictionary} from 'ts-essentials';
import {VError} from 'verror';

import {GitLab} from '../src/gitlab';
import {GitLabSource} from '../src/index';
import {GitLabConfig} from '../src/types';

describe('index', () => {
  const logger = new AirbyteLogger(
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const source = new GitLabSource(logger);
  const mockServer = getLocal();

  beforeEach(async () => {
    await mockServer.start();
  });

  afterEach(async () => {
    await mockServer.stop();
  });

  test('spec', async () => {
    await expect(source.spec()).resolves.toMatchObject({
      documentationUrl: expect.any(String),
      connectionSpecification: {
        type: 'object',
        required: ['token'],
        properties: {
          token: {
            type: 'string',
            title: 'Access Token',
            airbyte_secret: true,
          },
        },
      },
    });
  });

  test('check connection - invalid', async () => {
    const mockConfig = {
      token: 'invalid-token',
    } as GitLabConfig;

    jest.spyOn(GitLab, 'instance').mockImplementationOnce(async () => {
      throw new VError('Invalid token');
    });

    await expect(source.checkConnection(mockConfig)).resolves.toEqual([
      false,
      new VError('Invalid token'),
    ]);
  });

  test('check connection - valid', async () => {
    const mockConfig = {
      token: 'valid-token',
    } as GitLabConfig;

    const mockGitLab = {
      checkConnection: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(GitLab, 'instance').mockResolvedValueOnce(mockGitLab as any);

    const mockFilter = {
      getGroups: jest.fn().mockResolvedValue(['group1']),
    };
    jest.mock('../src/workspace-repo-filter', () => ({
      WorkspaceRepoFilter: {
        instance: jest.fn().mockReturnValue(mockFilter),
      },
    }));

    await expect(source.checkConnection(mockConfig)).resolves.toEqual([
      true,
      undefined,
    ]);
  });

  test('streams - with faros client', async () => {
    const mockConfig = {
      token: 'valid-token',
      api_key: 'faros-api-key',
    } as GitLabConfig;

    const streams = source.streams(mockConfig);
    expect(streams.length).toBeGreaterThan(0);
  });

  test('streams - without faros client', async () => {
    const mockConfig = {
      token: 'valid-token',
    } as GitLabConfig;

    const streams = source.streams(mockConfig);
    expect(streams.length).toBeGreaterThan(0);
  });
});
