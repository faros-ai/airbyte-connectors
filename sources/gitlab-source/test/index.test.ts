import {AirbyteLogger, AirbyteLogLevel} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import {GitLabSource} from '../src';
import {GitLab} from '../src/gitlab';

jest.mock('../src/gitlab');

describe('index', () => {
  const logger = new AirbyteLogger(
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const source = new GitLabSource(logger);
  const catalogPath = 'test/resources/catalog.json';

  test('spec', async () => {
    await expect(source.spec()).resolves.toMatchSnapshot();
  });

  test('check connection - invalid', async () => {
    const mockGitLab = {
      instance: jest.fn().mockRejectedValue(new VError('Invalid config')),
    };
    GitLab.instance = mockGitLab.instance;

    await expect(
      source.checkConnection({token: 'invalid_token'})
    ).resolves.toMatchSnapshot();
  });

  test('check connection - valid', async () => {
    const mockGitLab = {
      instance: jest.fn().mockResolvedValue({}),
    };
    GitLab.instance = mockGitLab.instance;

    await expect(
      source.checkConnection({token: 'valid_token'})
    ).resolves.toMatchSnapshot();
  });

  test('discover', async () => {
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    jest.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(catalog));

    await expect(
      source.discover({token: 'test_token'})
    ).resolves.toMatchSnapshot();
  });

  test('streams - groups', async () => {
    const config = {token: 'test_token'};
    const streams = source.streams(config);
    expect(streams.length).toEqual(1);
    expect(streams[0].streamName).toEqual('faros_groups');
  });
});
