import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import {Buildkite} from '../src/buildkite/buildkite';
import * as sut from '../src/index';

const BuildkiteInstance = Buildkite.instance;

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
    Buildkite.instance = BuildkiteInstance;
  });
  test('spec', async () => {
    const source = new sut.BuildkiteSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readTestResourceFile('spec.json'))
    );
  });
  test('check connection', async () => {
    // Buildkite.instance = jest.fn().mockImplementation(async () => {
    //   return new Buildkite(
    //     {get: jest.fn().mockResolvedValue({data: {organizations: []}})} as any,
    //     {get: jest.fn().mockResolvedValue({data: {organizations: []}})} as any
    //   );
    // });
    const source = new sut.BuildkiteSource(logger);
    await expect(
      source.checkConnection({
        token: '87c0cd3efa703a3c1d03828290a93a79d1853c54',
      })
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('check connection - incorrect token', async () => {
    // Buildkite.instance = jest.fn().mockImplementation(async () => {
    //   return new Buildkite(
    //     {get: jest.fn().mockResolvedValue({data: {organizations: []}})} as any,
    //     {get: jest.fn().mockResolvedValue({data: {organizations: []}})} as any
    //   );
    // });
    const source = new sut.BuildkiteSource(logger);
    await expect(source.checkConnection({})).resolves.toStrictEqual([
      false,
      new VError('Please verify your token are correct. Error: some error'),
    ]);
  });

  // test('check connection - incorrect variables', async () => {
  //   const source = new sut.BuildkiteSource(logger);
  //   await expect(source.checkConnection({})).resolves.toStrictEqual([
  //     false,
  //     new VError('token must be a not empty string'),
  //   ]);
  // });

  test('streams - organizations, use full_refresh sync mode', async () => {
    const fnFunc = jest.fn();

    const fileName = 'organizations.json';
    // Buildkite.instance = jest.fn().mockImplementation(() => {
    //   return new Buildkite(
    //     {
    //       get: fnFunc.mockResolvedValue({
    //         data: {data: readTestResourceFile(fileName)},
    //       }),
    //     } as any,
    //     {
    //       get: fnFunc.mockResolvedValue({
    //         data: {data: readTestResourceFile(fileName)},
    //       }),
    //     } as any
    //   );
    // });
    const source = new sut.BuildkiteSource(logger);
    const streams = source.streams({});
    const stream = streams[0];
    const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
    const items = [];
    for await (const item of itemIter) {
      items.push(item);
      console.log(item);
    }
    //expect(fnFunc).toHaveBeenCalledTimes(1);
    expect(items).toStrictEqual(readTestResourceFile(fileName));
  });

  // test('streams - pipelines, use full_refresh sync mode', async () => {
  //   const fnFunc = jest.fn();

  //   const fileName = 'pipelines.json';
  //   // Buildkite.instance = jest.fn().mockImplementation(() => {
  //   //   return new Buildkite(
  //   //     {
  //   //       get: fnFunc.mockResolvedValue({
  //   //         data: {data: readTestResourceFile(fileName)},
  //   //       }),
  //   //     } as any,
  //   //     {
  //   //       get: fnFunc.mockResolvedValue({
  //   //         data: {data: readTestResourceFile(fileName)},
  //   //       }),
  //   //     } as any
  //   //   );
  //   // });
  //   const source = new sut.BuildkiteSource(logger);
  //   const streams = source.streams({});
  //   const stream = streams[1];
  //   const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
  //   const items = [];
  //   for await (const item of itemIter) {
  //     items.push(item);
  //   }
  //   //xpect(fnFunc).toHaveBeenCalledTimes(1);
  //   expect(items).toStrictEqual(readTestResourceFile(fileName));
  // });

  // test('streams - builds, use full_refresh sync mode', async () => {
  //   const fnFunc = jest.fn();

  //   const fileName = 'builds.json';
  //   // Buildkite.instance = jest.fn().mockImplementation(() => {
  //   //   return new Buildkite(
  //   //     {
  //   //       get: fnFunc.mockResolvedValue({
  //   //         data: {data: readTestResourceFile(fileName)},
  //   //       }),
  //   //     } as any,
  //   //     {
  //   //       get: fnFunc.mockResolvedValue({
  //   //         data: {data: readTestResourceFile(fileName)},
  //   //       }),
  //   //     } as any
  //   //   );
  //   // });
  //   const source = new sut.BuildkiteSource(logger);
  //   const streams = source.streams({});
  //   const stream = streams[2];
  //   const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
  //   const items = [];
  //   for await (const item of itemIter) {
  //     items.push(item);
  //   }
  //   //expect(fnFunc).toHaveBeenCalledTimes(1);
  //   expect(items).toStrictEqual(readTestResourceFile(fileName));
  // });

  test('streams - jobs, use full_refresh sync mode', async () => {
    const fnFunc = jest.fn();

    const fileName = 'jobs.json';
    // Buildkite.instance = jest.fn().mockImplementation(() => {
    //   return new Buildkite(
    //     {
    //       get: fnFunc.mockResolvedValue({
    //         data: {data: readTestResourceFile(fileName)},
    //       }),
    //     } as any,
    //     {
    //       get: fnFunc.mockResolvedValue({
    //         data: {data: readTestResourceFile(fileName)},
    //       }),
    //     } as any
    //   );
    // });
    const source = new sut.BuildkiteSource(logger);
    const streams = source.streams({});
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
