import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import {readResourceFile} from 'faros-airbyte-common/common';
import fs from 'fs-extra';
import VError from 'verror';

import {CloudWatch, Config} from '../src/cloudwatch';
import * as sut from '../src/index';

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const validConfig: Config = {
    aws_region: 'us-west-2',
    credentials: {
      aws_access_key_id: 'YOUR_AWS_ACCESS_KEY_ID',
      aws_secret_access_key: 'YOUR_AWS_SECRET_ACCESS_KEY',
      aws_session_token: 'YOUR_AWS_SESSION_TOKEN',
    },
    query_groups: [
      {
        name: 'ExampleQueryGroup',
        queries: [{query: '{"metric":"CPUUtilization"}'}],
      },
    ],
    page_size: 100,
  };

  const source = new sut.CloudWatchMetricsSource(logger);

  test('spec', async () => {
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection - invalid', async () => {
    await expect(
      source.checkConnection({...validConfig, aws_region: undefined})
    ).resolves.toStrictEqual([false, new VError('Please specify AWS region')]);
    await expect(
      source.checkConnection({...validConfig, credentials: undefined})
    ).resolves.toStrictEqual([
      false,
      new VError('Please specify AWS credentials'),
    ]);
    await expect(
      source.checkConnection({
        ...validConfig,
        credentials: {
          aws_access_key_id: undefined,
          aws_secret_access_key: 'YOUR_AWS_SECRET_ACCESS_KEY',
        },
      })
    ).resolves.toStrictEqual([
      false,
      new VError('Please specify AWS access key ID'),
    ]);
    await expect(
      source.checkConnection({
        ...validConfig,
        credentials: {
          aws_access_key_id: 'YOUR_AWS_ACCESS_KEY_ID',
          aws_secret_access_key: undefined,
        },
      })
    ).resolves.toStrictEqual([
      false,
      new VError('Please specify AWS secret access key'),
    ]);
  });

  test('check connection', async () => {
    CloudWatch.instance = jest.fn().mockImplementation(() => {
      return new CloudWatch(
        {
          send: jest.fn().mockResolvedValue({}),
        } as any,
        '2021-01-01',
        '2021-01-02',
        100
      );
    });

    await expect(source.checkConnection(validConfig)).resolves.toStrictEqual([
      true,
      undefined,
    ]);
  });

  test('metrics incremental', async () => {
    const fnSend = jest.fn();
    const latestTimestamp = '2021-01-02T00:00:00.000Z';
    const expectedData = {
      MetricDataResults: [
        {
          Id: 'm1',
          Label: 'CPUUtilization',
          Timestamps: [
            new Date('2021-01-01T00:00:00.000Z'),
            new Date(latestTimestamp),
          ],
          Values: [0.5, 0.6],
        },
      ],
    };
    CloudWatch.instance = jest.fn().mockImplementation(() => {
      return new CloudWatch(
        {
          send: fnSend.mockResolvedValue(expectedData),
        } as any,
        '2021-01-01',
        '2021-01-02',
        100
      );
    });

    const streams = source.streams(validConfig);
    const stream = streams[0];
    const iter = stream.readRecords(
      SyncMode.INCREMENTAL,
      undefined,
      {queryGroup: validConfig.query_groups[0], queryHash: 'hash'},
      {
        ExampleQueryGroup: {
          hash: {
            timestamp: '2021-01-01T00:00:00.000Z',
          },
        },
      }
    );

    const items = [];
    for await (const item of iter) {
      items.push(item);
    }

    expect(fnSend).toHaveBeenCalledTimes(1);
    expect(items).toMatchSnapshot();
    expect(stream.getUpdatedState(undefined, undefined)).toEqual({
      ExampleQueryGroup: {
        hash: {
          timestamp: latestTimestamp,
        },
      },
    });
  });

  test('metrics full', async () => {
    const fnSend = jest.fn();
    const expectedData = {
      MetricDataResults: [
        {
          Id: 'm1',
          Label: 'CPUUtilization',
          Timestamps: [
            new Date('2021-01-01T00:00:00.000Z'),
            new Date('2021-01-02T00:00:00.000Z'),
          ],
          Values: [0.5, 0.6],
        },
      ],
    };
    CloudWatch.instance = jest.fn().mockImplementation(() => {
      return new CloudWatch(
        {
          send: fnSend.mockResolvedValue(expectedData),
        } as any,
        '2021-01-01',
        '2021-01-02',
        100
      );
    });

    const streams = source.streams(validConfig);
    const stream = streams[0];
    const iter = stream.readRecords(SyncMode.FULL_REFRESH, undefined, {
      queryGroup: validConfig.query_groups[0],
      queryHash: 'hash',
    });

    const items = [];
    for await (const item of iter) {
      items.push(item);
    }

    expect(fnSend).toHaveBeenCalledTimes(1);
    expect(items).toMatchSnapshot();
  });
});
