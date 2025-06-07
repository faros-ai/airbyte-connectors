import {AirbyteSourceLogger, AirbyteSpec} from 'faros-airbyte-cdk';
import {
  sourceCheckTest,
  sourceReadTest,
  sourceSchemaTest,
} from 'faros-airbyte-testing-tools';
import {readFileSync} from 'fs';
import {resolve} from 'path';

import {LaunchDarklySource} from '../src/index';

function readResourceFile(fileName: string): any {
  return JSON.parse(
    readFileSync(resolve(__dirname, '..', 'resources', fileName), 'utf8')
  );
}

function readTestResourceFile(fileName: string): any {
  return JSON.parse(
    readFileSync(
      resolve(__dirname, 'resources', 'test_files', fileName),
      'utf8'
    )
  );
}

describe('index', () => {
  const logger = new AirbyteSourceLogger();
  const source = new LaunchDarklySource(logger);

  test('spec', async () => {
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection', async () => {
    await sourceCheckTest({
      source,
      configOrPath: 'test_files/config.json',
    });
  });

  test('check connection - invalid', async () => {
    const [success] = await source.checkConnection(
      readTestResourceFile('invalid_config.json')
    );
    expect(success).toBe(false);
  });

  test('streams - projects, use full_refresh sync mode', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'test_files/config.json',
      catalogOrPath: 'test_files/full_configured_catalog.json',
    });
  });

  test('streams - environments, use full_refresh sync mode', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'test_files/config.json',
      catalogOrPath: 'test_files/full_configured_catalog.json',
    });
  });

  test('streams - feature_flags, use incremental sync mode', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'test_files/config.json',
      catalogOrPath: 'test_files/incremental_configured_catalog.json',
    });
  });

  test('streams - users, use full_refresh sync mode', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'test_files/config.json',
      catalogOrPath: 'test_files/full_configured_catalog.json',
    });
  });

  test('streams - experiments, use full_refresh sync mode', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'test_files/config.json',
      catalogOrPath: 'test_files/full_configured_catalog.json',
    });
  });

  test('streams - schema', async () => {
    await sourceSchemaTest(source, readTestResourceFile('config.json'));
  });
});
