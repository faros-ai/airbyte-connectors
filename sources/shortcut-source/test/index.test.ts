import {
  AirbyteConfig,
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import * as sut from '../src/index';
import {Shortcut, ShortcutConfig} from '../src/shortcut';

const ShortcutInstance = Shortcut.instance;

function readTestResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
}

describe('index', () => {
  const logger = new AirbyteLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  beforeEach(() => {
    Shortcut.instance = ShortcutInstance;
  });

  test('spec', async () => {
    const source = new sut.ShortcutSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readTestResourceFile('spec.json'))
    );
  });

  // test('check connection', async () => {
  //   const source = new sut.ShortcutSource(logger);
  //   await expect(
  //     source.checkConnection({
  //       token: '',
  //     })
  //   ).resolves.toStrictEqual([true, undefined]);
  // });

  // test('streams - projects, use full_refresh sync mode', async () => {
  //   const fileName = 'projects.json';
  //   const fnFunc = jest.fn();

  //   Shortcut.instance = jest.fn().mockImplementation(() => {
  //     return new Shortcut({
  //       get: {},
  //     } as any);
  //   });

  //   const source = new sut.ShortcutSource(logger);
  //   const streams = source.streams({
  //     token: '',
  //     base_url: '',
  //     version: '',
  //     project_public_id: 0,
  //   });
  //   const stream = streams[0];
  //   const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
  //   const items = [];
  //   for await (const item of itemIter) {
  //     items.push(item);
  //   }
  //   expect(fnFunc).toHaveBeenCalledTimes(1);
  //   expect(items).toStrictEqual(readTestResourceFile(fileName));
  // });

  // test('streams - iterations, use full_refresh sync mode', async () => {
  //   const fileName = 'iterations.json';
  //   const source = new sut.ShortcutSource(logger);
  //   const streams = source.streams({
  //     token: '',
  //     base_url: '',
  //     version: '',
  //     project_public_id: 0,
  //   });
  //   const stream = streams[1];
  //   const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
  //   const items = [];
  //   for await (const item of itemIter) {
  //     items.push(item);
  //   }
  //   expect(items).toStrictEqual(readTestResourceFile(fileName));
  // });

  // test('streams - epics, use full_refresh sync mode', async () => {
  //   const fileName = 'epics.json';
  //   const source = new sut.ShortcutSource(logger);
  //   const streams = source.streams({
  //     token: '',
  //     base_url: '',
  //     version: '',
  //     project_public_id: 0,
  //   });
  //   const stream = streams[2];
  //   const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
  //   const items = [];
  //   for await (const item of itemIter) {
  //     items.push(item);
  //   }
  //   expect(items).toStrictEqual(readTestResourceFile(fileName));
  // });

  // test('streams - stories, use full_refresh sync mode', async () => {
  //   const fileName = 'stories.json';
  //   const source = new sut.ShortcutSource(logger);
  //   const streams = source.streams({
  //     token: '',
  //     base_url: '',
  //     version: '',
  //     project_public_id: 0,
  //   });
  //   const stream = streams[3];
  //   const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
  //   const items = [];
  //   for await (const item of itemIter) {
  //     items.push(item);
  //   }
  //   expect(items).toStrictEqual(readTestResourceFile(fileName));
  // });

  // test('streams - members, use full_refresh sync mode', async () => {
  //   const fileName = 'members.json';
  //   const source = new sut.ShortcutSource(logger);
  //   const streams = source.streams({
  //     token: '',
  //     base_url: '',
  //     version: '',
  //     project_public_id: 0,
  //   });
  //   const stream = streams[4];
  //   const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
  //   const items = [];
  //   for await (const item of itemIter) {
  //     items.push(item);
  //   }
  //   expect(items).toStrictEqual(readTestResourceFile(fileName));
  // });

  // test('streams - repositories, use full_refresh sync mode', async () => {
  //   const fileName = 'repositories.json';
  //   const source = new sut.ShortcutSource(logger);
  //   const streams = source.streams({
  //     token: '',
  //     base_url: '',
  //     version: '',
  //     project_public_id: 0,
  //   });
  //   const stream = streams[5];
  //   const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
  //   const items = [];
  //   for await (const item of itemIter) {
  //     items.push(item);
  //   }
  //   expect(items).toStrictEqual(readTestResourceFile(fileName));
  // });
});
