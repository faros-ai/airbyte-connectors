import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import VError from 'verror';

import * as sut from '../src/index';

function readResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
}

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const config = {
    api_key: 'test_api_key',
    organization: 'test',
    tools: ['codeql'],
  };

  test('spec', async () => {
    const source = new sut.TromzoSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection - no credentials', async () => {
    const source = new sut.TromzoSource(logger);
    await expect(source.checkConnection({} as any)).resolves.toStrictEqual([
      false,
      new VError('Please provide a valid Tromzo API key'),
    ]);
  });

  test('check connection - no organization', async () => {
    const source = new sut.TromzoSource(logger);
    await expect(
      source.checkConnection({api_key: 'test_key', organization: ''} as any)
    ).resolves.toStrictEqual([
      false,
      new VError('Please provide a valid Tromzo organization'),
    ]);
  });

  test('check connection - valid credentials', async () => {
    const source = new sut.TromzoSource(logger);
    await expect(source.checkConnection(config)).resolves.toStrictEqual([
      true,
      undefined,
    ]);
  });
});
