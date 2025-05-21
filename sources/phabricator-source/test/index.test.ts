import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  readResourceAsJSON,
  readTestFileAsJSON,
  SyncMode,
} from 'faros-airbyte-cdk';
import {DateTime} from 'luxon';
import VError from 'verror';

import * as sut from '../src/index';
import {Phabricator} from '../src/phabricator';


describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  test('spec', async () => {
    const source = new sut.PhabricatorSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceAsJSON('spec.json'))
    );
  });

  const sourceConfig = {
    server_url: 'url',
    token: 'token',
    cutoff_days: 90,
  };

  test('check connection', async () => {
    Phabricator.instance = jest.fn().mockImplementation(() => {
      return new Phabricator(
        undefined,
        undefined,
        {user: {whoami: jest.fn().mockResolvedValue({})}} as any,
        DateTime.now(),
        [],
        [],
        100,
        logger
      );
    });

    const source = new sut.PhabricatorSource(logger);
    await expect(source.checkConnection(sourceConfig)).resolves.toStrictEqual([
      true,
      undefined,
    ]);
  });

  test('check connection bad', async () => {
    const source = new sut.PhabricatorSource(logger);
    const expectedError = new VError('Bad Connection');
    Phabricator.instance = jest.fn().mockImplementation(() => {
      return new Phabricator(
        undefined,
        undefined,
        {user: {whoami: jest.fn().mockRejectedValue(expectedError)}} as any,
        DateTime.now(),
        [],
        [],
        100,
        logger
      );
    });
    await expect(source.checkConnection(sourceConfig)).resolves.toStrictEqual([
      false,
      expectedError,
    ]);
  });

  test('streams - repositories', async () => {
    const repos = readTestFileAsJSON('repositories.json');
    Phabricator.instance = jest.fn().mockImplementation(() => {
      return new Phabricator(
        undefined,
        undefined,
        {
          diffusion: {repositorySearch: jest.fn().mockResolvedValue(repos)},
        } as any,
        DateTime.now(),
        [],
        [],
        100,
        logger
      );
    });

    const source = new sut.PhabricatorSource(logger);
    const streams = source.streams(sourceConfig);
    const stream = streams[0];
    let itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
    let items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    expect(items).toStrictEqual(repos.result.data);

    itemIter = stream.readRecords(SyncMode.INCREMENTAL, undefined, undefined, {
      latestModifiedAt: 1632939206,
    });
    items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    expect(items).toStrictEqual([repos.result.data[0]]);
  });

  test('streams - revisions', async () => {
    const repos = readTestFileAsJSON('repositories.json');
    const revisions = readTestFileAsJSON('revisions.json');
    Phabricator.instance = jest.fn().mockImplementation(() => {
      return new Phabricator(
        undefined,
        undefined,
        {
          differential: {
            revisionSearch: jest.fn().mockResolvedValue(revisions),
          },
          diffusion: {repositorySearch: jest.fn().mockResolvedValue(repos)},
        } as any,
        DateTime.fromMillis(0),
        [],
        [],
        100,
        logger
      );
    });

    const source = new sut.PhabricatorSource(logger);
    const streams = source.streams(sourceConfig);
    const stream = streams[2];
    let itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
    let items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    expect(items).toStrictEqual(revisions.result.data);

    itemIter = stream.readRecords(SyncMode.INCREMENTAL, undefined, undefined, {
      latestModifiedAt: 1632523638,
    });
    items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    expect(items).toStrictEqual([revisions.result.data[0]]);
  });

  test('streams - revision_diffs', async () => {
    const repos = readTestFileAsJSON('repositories.json');
    const revisions = readTestFileAsJSON('revisions.json');
    const revisionDiffs = readTestFileAsJSON('revision_diffs.json');
    const revisionDiffsRecords = readTestFileAsJSON(
      'revision_diffs_records.json'
    );
    const rawDiff = readTestFileAsJSON('raw_diff.json');
    Phabricator.instance = jest.fn().mockImplementation(() => {
      return new Phabricator(
        undefined,
        undefined,
        {
          differential: {
            diffSearch: jest.fn().mockResolvedValue(revisionDiffs),
            getrawdiff: jest.fn().mockResolvedValue(rawDiff),
            revisionSearch: jest.fn().mockResolvedValue(revisions),
          },
          diffusion: {repositorySearch: jest.fn().mockResolvedValue(repos)},
        } as any,
        DateTime.fromMillis(0),
        [],
        [],
        100,
        logger
      );
    });

    const source = new sut.PhabricatorSource(logger);
    const streams = source.streams(sourceConfig);
    const stream = streams[3];
    let itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
    let items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    expect(items).toStrictEqual(revisionDiffsRecords);

    itemIter = stream.readRecords(SyncMode.INCREMENTAL, undefined, undefined, {
      latestModifiedAt: 100,
    });
    items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    expect(items).toStrictEqual(revisionDiffsRecords);
  });
});
