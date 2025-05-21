import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  readResourceAsJSON,
} from 'faros-airbyte-cdk';

import * as sut from '../src/index';

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  test('spec', async () => {
    const source = new sut.ZephyrScaleSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceAsJSON('spec.json'))
    );
  });
});
