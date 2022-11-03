import {AirbyteLogger, AirbyteLogLevel, AirbyteSpec} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import * as sut from '../src/index';
import {Workday} from '../src/workday';

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
    const source = new sut.WorkdaySource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection - if config params are not provided', async () => {
    const source = new sut.WorkdaySource(logger);
    await expect(source.checkConnection({} as any)).resolves.toStrictEqual([
      false,
      new VError('tenant must not be an empty string'),
    ]);
    await expect(
      source.checkConnection({
        tenant: 'acme',
        clientId: '',
        clientSecret: 'bar',
        refreshToken: 'baz',
      })
    ).resolves.toStrictEqual([
      false,
      new VError('clientId must not be an empty string'),
    ]);
    await expect(
      source.checkConnection({
        tenant: 'acme',
        clientId: 'foo',
        clientSecret: '',
        refreshToken: 'baz',
      })
    ).resolves.toStrictEqual([
      false,
      new VError('clientSecret must not be an empty string'),
    ]);
    await expect(
      source.checkConnection({
        tenant: 'acme',
        clientId: 'foo',
        clientSecret: 'bar',
        refreshToken: '',
      })
    ).resolves.toStrictEqual([
      false,
      new VError('refreshToken must not be an empty string'),
    ]);
  });

  test('check connection', async () => {
    Workday.instance = jest.fn().mockImplementation(() => {
      return new Workday(
        logger,
        {
          get: jest.fn().mockResolvedValue({
            data: {
              data: [],
              total: 0,
            },
          }),
        } as any,
        20,
        'base-url'
      );
    });
    const source = new sut.WorkdaySource(logger);
    await expect(
      source.checkConnection({
        tenant: 'acme',
        clientId: 'foo',
        clientSecret: 'bar',
        refreshToken: 'baz',
      })
    ).resolves.toStrictEqual([true, undefined]);
  });
});
