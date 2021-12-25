import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  redactConfig,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import {Buildkite, BuildkiteConfig} from '../src/buildkite/buildkite';
import * as sut from '../src/index';

const BuildkiteInstance = Buildkite.instance;

function readTestResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
}
function readConfig(): BuildkiteConfig {
  return readTestResourceFile('config.json') as BuildkiteConfig;
}
describe('index', () => {
  const logger = new AirbyteLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  beforeEach(() => {
    Buildkite.instance = BuildkiteInstance;
  });

  test('spec', async () => {
    const source = new sut.BuildkiteSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readTestResourceFile('spec.json'))
    );
  });
  test('check connection', async () => {
    const source = new sut.BuildkiteSource(logger);
    await expect(
      source.checkConnection({
        token: readConfig().token,
      })
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('check connection - incorrect token', async () => {
    const source = new sut.BuildkiteSource(logger);
    await expect(source.checkConnection({})).resolves.toStrictEqual([
      false,
      new VError('Please verify your token are correct. Error: some error'),
    ]);
  });

  test('check connection - incorrect variables', async () => {
    const source = new sut.BuildkiteSource(logger);
    await expect(source.checkConnection({})).resolves.toStrictEqual([
      false,
      new VError('token must be a not empty string'),
    ]);
  });

  test('streams - organizations, use full_refresh sync mode', async () => {
    //const fnFunc = jest.fn();

    const fileName = 'organizations.json';
    const source = new sut.BuildkiteSource(logger);
    const streams = source.streams(readConfig());
    const stream = streams[0];
    const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
    const items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    //expect(fnFunc).toHaveBeenCalledTimes(1);
    expect(items).toStrictEqual(readTestResourceFile(fileName));
  });

  test('streams - pipelines, use full_refresh sync mode', async () => {
    const fnFunc = jest.fn();

    const fileName = 'pipelines.json';
    const source = new sut.BuildkiteSource(logger);
    const streams = source.streams(readConfig());
    const stream = streams[1];
    const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
    const items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    //xpect(fnFunc).toHaveBeenCalledTimes(1);
    expect(items).toStrictEqual(readTestResourceFile(fileName));
  });

  test('streams - builds, use full_refresh sync mode', async () => {
    //const fnFunc = jest.fn();

    const fileName = 'builds.json';
    const source = new sut.BuildkiteSource(logger);
    const streams = source.streams(readConfig());
    const stream = streams[2];
    const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
    const items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    //expect(fnFunc).toHaveBeenCalledTimes(1);
    expect(items).toStrictEqual(readTestResourceFile(fileName));
  });

  test('streams - jobs, use full_refresh sync mode', async () => {
    //const fnFunc = jest.fn();

    const fileName = 'jobs.json';
    const source = new sut.BuildkiteSource(logger);
    const streams = source.streams(readConfig());
    const stream = streams[3];
    const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
    const items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    //expect(fnFunc).toHaveBeenCalledTimes(1);
    expect(items).toStrictEqual(readTestResourceFile(fileName));
  });
});
