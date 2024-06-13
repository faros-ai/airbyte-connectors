import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import VError from 'verror';

import * as sut from '../src/index';
import {Xray} from '../src/xray';

function readResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
}

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const config = {
    authentication: {client_id: 'client_id', client_secret: 'client_secret'},
    projects: ['TEST'],
  };

  test('spec', async () => {
    const source = new sut.XraySource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection - no credentials', async () => {
    const source = new sut.XraySource(logger);
    await expect(source.checkConnection({} as any)).resolves.toStrictEqual([
      false,
      new VError(
        'Please provide Xray Cloud authentication details, Client Id and a Client Secret'
      ),
    ]);
  });

  test('check connection - valid credentials', async () => {
    Xray.instance = jest.fn().mockImplementation(() => {
      return new Xray(
        {post: jest.fn().mockResolvedValue('token')} as any,
        logger
      );
    });
    const source = new sut.XraySource(logger);
    await expect(source.checkConnection(config)).resolves.toStrictEqual([
      true,
      undefined,
    ]);
  });
});
