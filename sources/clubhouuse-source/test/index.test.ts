import {
  AirbyteConfig,
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import {Clubhouse, ClubhouseConfig} from '../src/clubhouse';
import * as sut from '../src/index';

const ClubhouseInstance = Clubhouse.instance;

function readTestResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
}
function readConfig(): ClubhouseConfig {
  return readTestResourceFile('config.json') as ClubhouseConfig;
}
describe('index', () => {
  const logger = new AirbyteLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  beforeEach(() => {
    Clubhouse.instance = ClubhouseInstance;
  });
  test('spec', async () => {
    const source = new sut.ClubhouseSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readTestResourceFile('spec.json'))
    );
  });
  test('check connection', async () => {
    const source = new sut.ClubhouseSource(logger);
    const config = readConfig();
    await expect(
      source.checkConnection({
        token: config.token,
      })
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('streams - projects, use full_refresh sync mode', async () => {
    //const fnFunc = jest.fn();
    const fileName = 'projects.json';
    const source = new sut.ClubhouseSource(logger);
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

  test('streams - iterations, use full_refresh sync mode', async () => {
    const fileName = 'iterations.json';
    const source = new sut.ClubhouseSource(logger);
    const streams = source.streams(readConfig());
    const stream = streams[1];
    const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
    const items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    expect(items).toStrictEqual(readTestResourceFile(fileName));
  });
  // test('streams - epics, use full_refresh sync mode', async () => {
  //   const fileName = 'epics.json';
  //   const source = new sut.ClubhouseSource(logger);
  //   const streams = source.streams(readConfig());
  //   const stream = streams[2];
  //   const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
  //   const items = [];
  //   for await (const item of itemIter) {
  //     items.push(item);
  //   }
  //   expect(items).toStrictEqual(readTestResourceFile(fileName));
  // });
  test('streams - stories, use full_refresh sync mode', async () => {
    const fileName = 'stories.json';
    const source = new sut.ClubhouseSource(logger);
    const streams = source.streams(readConfig());
    const stream = streams[3];
    const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
    const items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    expect(items).toStrictEqual(readTestResourceFile(fileName));
  });
  test('streams - members, use full_refresh sync mode', async () => {
    const fileName = 'members.json';
    const source = new sut.ClubhouseSource(logger);
    const streams = source.streams(readConfig());
    const stream = streams[4];
    const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
    const items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    expect(items).toStrictEqual(readTestResourceFile(fileName));
  });
  // test('streams - repositories, use full_refresh sync mode', async () => {
  //   const fileName = 'repositories.json';
  //   const source = new sut.ClubhouseSource(logger);
  //   const streams = source.streams(readConfig());
  //   const stream = streams[5];
  //   const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
  //   const items = [];
  //   for await (const item of itemIter) {
  //     items.push(item);
  //   }
  //   expect(items).toStrictEqual(readTestResourceFile(fileName));
  // });
});
