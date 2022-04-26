import {AxiosInstance} from 'axios';
import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import * as sut from '../src/index';
import {TravisCI} from '../src/travisci/travisci';

function readResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
}

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
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('spec', async () => {
    const source = new sut.TravisCISource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });
  test('check connection', async () => {
    TravisCI.instance = jest.fn().mockImplementation(() => {
      return new TravisCI(
        {
          get: jest.fn().mockResolvedValue({}),
        } as unknown as AxiosInstance,
        new Date('2010-03-27T14:03:51-0800'),
        100,
        'huongtn'
      );
    });

    const source = new sut.TravisCISource(logger);
    await expect(
      source.checkConnection({
        token: '',
        organization: '',
        cutoff_days: 90,
      })
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('check connection - incorrect config', async () => {
    TravisCI.instance = jest.fn().mockImplementation(() => {
      return new TravisCI(
        null,
        new Date('2010-03-27T14:03:51-0800'),
        100,
        'huongtn'
      );
    });
    const source = new sut.TravisCISource(logger);
    await expect(
      source.checkConnection({
        token: '',
        organization: '',
        cutoff_days: 90,
      })
    ).resolves.toStrictEqual([
      false,
      new VError(
        "TravisCI api request failed: Cannot read properties of null (reading 'get')"
      ),
    ]);
  });

  test('streams - builds, use full_refresh sync mode', async () => {
    const fnBuildsList = jest.fn();
    TravisCI.instance = jest.fn().mockImplementation(() => {
      return new TravisCI(
        {
          get: fnBuildsList.mockResolvedValue({
            data: readTestResourceFile('builds_input.json'),
          }),
        } as any,
        new Date('2010-03-27T14:03:51-0800'),
        100,
        'huongtn'
      );
    });
    const source = new sut.TravisCISource(logger);
    const streams = source.streams({});

    const buildsStream = streams[0];
    const buildsIter = buildsStream.readRecords(SyncMode.FULL_REFRESH);
    const builds = [];
    for await (const build of buildsIter) {
      builds.push(build);
    }
    expect(fnBuildsList).toHaveBeenCalledTimes(1);
    expect(builds).toStrictEqual(readTestResourceFile('builds.json'));
  });

  test('streams - repositories, use full_refresh sync mode', async () => {
    const fnRepositoriesList = jest.fn();
    TravisCI.instance = jest.fn().mockImplementation(() => {
      return new TravisCI(
        {
          get: fnRepositoriesList.mockResolvedValue({
            data: readTestResourceFile('repositories_input.json'),
          }),
        } as any,
        new Date('2010-03-27T14:03:51-0800'),
        100,
        'huongtn'
      );
    });
    const source = new sut.TravisCISource(logger);
    const streams = source.streams({});

    const repositoriesStream = streams[1];
    const repositoriesIter = repositoriesStream.readRecords(
      SyncMode.FULL_REFRESH
    );
    const repositories = [];
    for await (const repository of repositoriesIter) {
      repositories.push(repository);
    }
    expect(fnRepositoriesList).toHaveBeenCalledTimes(1);
    expect(repositories).toStrictEqual(
      readTestResourceFile('repositories.json')
    );
  });

  test('streams - owners, use full_refresh sync mode', async () => {
    const fnOwnersList = jest.fn();
    TravisCI.instance = jest.fn().mockImplementation(() => {
      return new TravisCI(
        {
          get: fnOwnersList.mockResolvedValue({
            data: readTestResourceFile('owners_input.json'),
          }),
        } as any,
        new Date('2010-03-27T14:03:51-0800'),
        100,
        'huongtn'
      );
    });
    const source = new sut.TravisCISource(logger);
    const streams = source.streams({});

    const ownersStream = streams[2];
    const ownersIter = ownersStream.readRecords(SyncMode.FULL_REFRESH);
    const owners = [];
    for await (const owner of ownersIter) {
      owners.push(owner);
    }
    expect(fnOwnersList).toHaveBeenCalledTimes(1);
    expect(owners).toStrictEqual([readTestResourceFile('owners.json')]);
  });
});
