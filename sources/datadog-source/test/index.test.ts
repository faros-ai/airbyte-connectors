import {v1, v2} from '@datadog/datadog-api-client';
import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import {Datadog, DatadogClient, DatadogConfig} from '../src/datadog';
import * as sut from '../src/index';

function readResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
}

function readTestResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
}

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  test('spec', async () => {
    const source = new sut.DatadogSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection bad token', async () => {
    const source = new sut.DatadogSource(logger);
    const expectedError = new VError('Bad Connection');
    Datadog.instance = jest.fn().mockReturnValue({
      checkConnection: jest.fn().mockRejectedValue(expectedError),
    });
    await expect(
      source.checkConnection({
        api_key: 'bad',
        application_key: 'bad',
      })
    ).resolves.toStrictEqual([false, expectedError]);
  });

  const sourceConfig = {api_key: 'good', application_key: 'good'};

  test('check connection good token', async () => {
    const source = new sut.DatadogSource(logger);
    Datadog.instance = jest.fn().mockReturnValue({
      checkConnection: jest.fn().mockResolvedValue({}),
    });
    await expect(source.checkConnection(sourceConfig)).resolves.toStrictEqual([
      true,
      undefined,
    ]);
  });

  test('streams - incidents, use full_refresh sync mode', async () => {
    const res = readTestResourceFile('incidents.json');
    const pagination = new v2.IncidentResponseMetaPagination();
    Object.assign(pagination, res.meta.pagination);
    const incidents = {...res, meta: {pagination}};
    Datadog.instance = jest.fn().mockReturnValue(
      new Datadog(
        {
          incidents: {
            listIncidents: jest.fn().mockReturnValue(incidents),
          } as unknown as v2.IncidentsApi,
        } as DatadogClient,
        10,
        undefined,
        logger
      )
    );

    const source = new sut.DatadogSource(logger);
    const streams = source.streams(sourceConfig);
    const stream = streams[0];
    const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
    const items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    expect(items).toStrictEqual(res.data);
  });

  test('streams - incidents, use incremental sync mode', async () => {
    const res = readTestResourceFile('incidents.json');
    const pagination = new v2.IncidentResponseMetaPagination();
    Object.assign(pagination, res.meta.pagination);
    const incidents = {...res, meta: {pagination}};
    Datadog.instance = jest.fn().mockReturnValue(
      new Datadog(
        {
          incidents: {
            listIncidents: jest.fn().mockReturnValue(incidents),
          } as unknown as v2.IncidentsApi,
        } as DatadogClient,
        10,
        undefined,
        logger
      )
    );

    const source = new sut.DatadogSource(logger);
    const streams = source.streams(sourceConfig);
    const stream = streams[0];
    const itemIter = stream.readRecords(
      SyncMode.INCREMENTAL,
      undefined,
      undefined,
      {lastModified: '2022-02-27T21:00:44.706Z'}
    );
    const items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    expect(items).toStrictEqual([incidents.data[1]]);
  });

  test('streams - metrics, use full_refresh sync mode', async () => {
    const metricsResponse = readTestResourceFile('metrics.json');
    Datadog.instance = jest.fn().mockReturnValue(
      new Datadog(
        {
          metrics: {
            queryMetrics: jest.fn().mockReturnValue(metricsResponse),
          } as unknown as v1.MetricsApi,
        } as DatadogClient,
        10,
        {
          metrics: ['system.cpu.idle{*}'],
        } as DatadogConfig,
        logger
      )
    );

    const source = new sut.DatadogSource(logger);
    const streams = source.streams(sourceConfig);
    const stream = streams[1];
    const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
    const items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    expect(items[0]).toStrictEqual({
      displayName: 'system.cpu.idle',
      id: '186b347b33f1ffb049439fba14dc3090-system.cpu.idle-1575317847',
      queryHash: '186b347b33f1ffb049439fba14dc3090',
      metric: 'system.cpu.idle',
      perUnit: undefined,
      primaryUnit: {
        family: 'time',
        name: 'minute',
        plural: 'minutes',
        scale_factor: 60,
        short_name: 'min',
      },
      scope: 'host:foo,env:test',
      tagSet: [],
      timestamp: 1575317847,
      value: 0.5,
    });
  });

  test('streams - metrics, use incremental sync mode', async () => {
    const metricsResponse = readTestResourceFile('metrics.json');
    Datadog.instance = jest.fn().mockReturnValue(
      new Datadog(
        {
          metrics: {
            queryMetrics: jest.fn().mockReturnValue(metricsResponse),
          } as unknown as v1.MetricsApi,
        } as DatadogClient,
        10,
        {
          metrics: ['system.cpu.idle{*}'],
        } as DatadogConfig,
        logger
      )
    );

    const source = new sut.DatadogSource(logger);
    const streams = source.streams(sourceConfig);
    const stream = streams[1];
    const itemIter = stream.readRecords(
      SyncMode.INCREMENTAL,
      undefined,
      undefined,
      {lastModifiedAt: '2022-02-27T21:00:44.706Z'}
    );
    const items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    expect(items[0]).toStrictEqual({
      displayName: 'system.cpu.idle',
      id: '186b347b33f1ffb049439fba14dc3090-system.cpu.idle-1575317847',
      queryHash: '186b347b33f1ffb049439fba14dc3090',
      metric: 'system.cpu.idle',
      perUnit: undefined,
      primaryUnit: {
        family: 'time',
        name: 'minute',
        plural: 'minutes',
        scale_factor: 60,
        short_name: 'min',
      },
      scope: 'host:foo,env:test',
      tagSet: [],
      timestamp: 1575317847,
      value: 0.5,
    });
  });

  test('streams - users, use full_refresh sync mode', async () => {
    const users = readTestResourceFile('users.json');
    Datadog.instance = jest.fn().mockReturnValue(
      new Datadog(
        {
          users: {
            listUsers: jest.fn().mockReturnValue(users),
          } as unknown as v2.UsersApi,
        } as DatadogClient,
        10,
        undefined,
        logger
      )
    );

    const source = new sut.DatadogSource(logger);
    const streams = source.streams(sourceConfig);
    const stream = streams[2];
    const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
    const items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    expect(items).toStrictEqual(users.data);
  });

  test('streams - users, use incremental sync mode', async () => {
    const users = readTestResourceFile('users.json');
    Datadog.instance = jest.fn().mockReturnValue(
      new Datadog(
        {
          users: {
            listUsers: jest.fn().mockReturnValue(users),
          } as unknown as v2.UsersApi,
        } as DatadogClient,
        10,
        undefined,
        logger
      )
    );

    const source = new sut.DatadogSource(logger);
    const streams = source.streams(sourceConfig);
    const stream = streams[2];
    const itemIter = stream.readRecords(
      SyncMode.INCREMENTAL,
      undefined,
      undefined,
      {lastModifiedAt: '2022-02-27T21:00:44.706Z'}
    );
    const items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    expect(items).toStrictEqual([users.data[1]]);
  });

  test('streams - slos', async () => {
    const res = readTestResourceFile('slos.json');
    const pagination = new v1.SearchSLOResponseMetaPage();
    Object.assign(pagination, res.meta.pagination);
    const slos = {...res, meta: {pagination}};
    Datadog.instance = jest.fn().mockReturnValue(
      new Datadog(
        {
          slos: {
            searchSLO: jest.fn().mockReturnValue(slos),
          } as unknown as v1.SLOResponse,
        } as DatadogClient,
        10,
        undefined,
        logger
      )
    );

    const source = new sut.DatadogSource(logger);
    const streams = source.streams(sourceConfig);
    const stream = streams[3];
    const itemIter = stream.readRecords(SyncMode.FULL_REFRESH);
    const items = [];
    for await (const item of itemIter) {
      items.push(item);
    }
    expect(items).toMatchSnapshot();
  });
});
