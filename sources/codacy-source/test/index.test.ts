import {
  AirbyteSourceLogger,
  AirbyteSpec,
} from 'faros-airbyte-cdk';

import {CodacySource} from '../src/index';

function sourceLogger(): AirbyteSourceLogger {
  return new AirbyteSourceLogger();
}

describe('index', () => {
  test('spec', async () => {
    const source = new CodacySource(sourceLogger());
    await expect(source.spec()).resolves.toBeInstanceOf(AirbyteSpec);
  });

  test('check connection', async () => {
    const source = new CodacySource(sourceLogger());
    await expect(
      source.checkConnection({
        api_token: 'invalid',
        organization: 'test-org',
      })
    ).resolves.toStrictEqual([false, expect.any(Error)]);
  });

  test('streams - repositories, issues, metrics', async () => {
    const source = new CodacySource(sourceLogger());
    const streams = source.streams({
      api_token: 'test-token',
      organization: 'test-org',
    });

    const streamNames = streams.map((stream) => stream.constructor.name);
    expect(streamNames).toStrictEqual(['Repositories', 'Issues', 'CodeQuality']);
  });
});
