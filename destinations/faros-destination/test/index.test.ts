import {
  AirbyteConnectionStatus,
  AirbyteConnectionStatusMessage,
  AirbyteSpec,
} from 'cdk/lib';
import nock from 'nock';

import * as sut from '../src/index';

describe('index', () => {
  const apiUrl = 'https://localhost:9191/api';
  const program = sut.mainCommand({exitOverride: true, suppressOutput: true});
  const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

  afterEach(() => {
    consoleSpy.mockClear();
  });

  afterAll(() => {
    consoleSpy.mockRestore();
  });

  test('help', async () => {
    expect(() => program.parse(['node', 'test', '--help'])).toThrow(
      '(outputHelp)'
    );
  });

  test('spec', async () => {
    await program.parseAsync(['node', 'main', 'spec']);
    expect(console.log).toBeCalledTimes(1);
    expect(console.log).toHaveBeenLastCalledWith(
      JSON.stringify(new AirbyteSpec(require('../resources/spec.json')))
    );
  });

  test('check', async () => {
    const mock = nock(apiUrl)
      .get('/users/me')
      .reply(200, {tenantId: '1'})
      .get('/graphs/test-graph/statistics')
      .reply(200, {});

    await program.parseAsync([
      'node',
      'main',
      'check',
      '--config',
      'test/resources/config.json',
    ]);

    mock.done();
    expect(console.log).toBeCalledTimes(1);
    expect(console.log).toHaveBeenLastCalledWith(
      JSON.stringify(
        new AirbyteConnectionStatusMessage({
          status: AirbyteConnectionStatus.SUCCEEDED,
        })
      )
    );
  });
});
