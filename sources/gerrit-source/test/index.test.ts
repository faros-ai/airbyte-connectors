import {AirbyteLogLevel} from 'faros-airbyte-cdk';
import * as sut from 'faros-airbyte-testing-tools';

describe('gerrit source', () => {
  const logger = sut.stdoutLogger(AirbyteLogLevel.WARN);

  test('spec', async () => {
    const response = await sut.cli.run(
      ['sources/gerrit-source/bin/main', 'spec'],
      logger
    );

    expect(response).toMatchSnapshot();
  });

  test('check connection', async () => {
    const response = await sut.cli.run(
      [
        'sources/gerrit-source/bin/main',
        'check',
        '--config',
        'sources/gerrit-source/test/test-config.json',
      ],
      logger
    );

    expect(response.status).toBe('FAILED');
    expect(response.message).toContain('Failed to connect to Gerrit server');
  });
});