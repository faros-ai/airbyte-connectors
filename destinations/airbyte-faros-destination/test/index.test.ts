import {
  AirbyteConfig,
  AirbyteConnectionStatus,
  AirbyteConnectionStatusMessage,
  AirbyteSpec,
} from 'faros-airbyte-cdk';
import {getLocal} from 'mockttp';
import os from 'os';

import {Edition, FarosDestinationRunner, InvalidRecordStrategy} from '../src';
import {FarosDestination} from '../src/destination';
import {FarosDestinationLogger} from '../src/destination-logger';
import {CLI, read} from '../src/testing-tools/cli';
import {initMockttp, tempConfig} from '../src/testing-tools/testing-tools';

describe('index', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  let configPath: string;

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({api_url: mockttp.url});
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('help', async () => {
    const cli = await CLI.runWith(['--help']);
    expect(await read(cli.stderr)).toBe('');
    expect(await read(cli.stdout)).toMatch(/^Usage: main*/);
    expect(await cli.wait()).toBe(0);
  });

  test('spec', async () => {
    const cli = await CLI.runWith(['spec']);
    expect(await read(cli.stdout)).toMatchSnapshot();
    expect(await read(cli.stderr)).toBe('');
    expect(await cli.wait()).toBe(0);
  });

  test('check', async () => {
    const cli = await CLI.runWith(['check', '--config', configPath]);

    expect(await read(cli.stderr)).toBe('');
    expect(await read(cli.stdout)).toBe(
      JSON.stringify(
        new AirbyteConnectionStatusMessage({
          status: AirbyteConnectionStatus.SUCCEEDED,
        })
      ) + os.EOL
    );
    expect(await cli.wait()).toBe(0);
  });

  test('check community edition config', async () => {
    const configPath = await tempConfig({
      api_url: mockttp.url,
      invalid_record_strategy: InvalidRecordStrategy.SKIP,
      edition: Edition.COMMUNITY,
    });
    const cli = await CLI.runWith(['check', '--config', configPath]);

    expect(await read(cli.stderr)).toBe('');
    expect(await read(cli.stdout)).toBe(
      JSON.stringify(
        new AirbyteConnectionStatusMessage({
          status: AirbyteConnectionStatus.SUCCEEDED,
        })
      ) + os.EOL
    );
    expect(await cli.wait()).toBe(0);
  });

  test('fail check on invalid segment user id', async () => {
    const configPath = await tempConfig({
      api_url: mockttp.url,
      invalid_record_strategy: InvalidRecordStrategy.SKIP,
      edition: Edition.COMMUNITY,
      edition_configs: {segment_user_id: 'badid'},
    });
    const cli = await CLI.runWith(['check', '--config', configPath]);

    expect(await read(cli.stderr)).toBe('');
    expect(await read(cli.stdout)).toContain(
      'Segment User Id badid is not a valid UUID.'
    );
    expect(await cli.wait()).toBe(0);
  });

  test('check for circular converter dependencies', async () => {
    const dest = new FarosDestination(new FarosDestinationLogger());
    expect(() =>
      dest.checkForCircularDependencies({
        s1: new Set(['s2', 's3', 's4']),
        s2: new Set('s3'),
        s3: new Set('s0'),
      })
    ).not.toThrow();
    expect(() =>
      dest.checkForCircularDependencies({
        s1: new Set(['s1']),
      })
    ).toThrow(/s1,s1/);
    expect(() =>
      dest.checkForCircularDependencies({
        s1: new Set(['s2']),
        s2: new Set(['s1']),
      })
    ).toThrow(/s1,s2,s1/);
    expect(() =>
      dest.checkForCircularDependencies({
        s1: new Set(['s2', 's4']),
        s2: new Set(['s0']),
        s3: new Set(['s0', 's1']),
        s4: new Set(['s3']),
      })
    ).toThrow(/s1,s4,s3,s1/);
  });

  test('allow overriding spec', async () => {
    const dest = new FarosDestinationRunner(
      new AirbyteSpec({
        documentationUrl: 'test',
        connectionSpecification: {foo: 'bar'},
      })
    );
    const main = dest.mainCommand().exitOverride();
    const res = await main
      .parseAsync(['node', 'main', 'spec'])
      .catch((e) => fail(e));
    expect(res.opts()).toEqual({});
  });

  test('allow adding config check', async () => {
    const dest = new FarosDestinationRunner(
      new AirbyteSpec({
        documentationUrl: 'test',
        connectionSpecification: {foo: 'bar'},
      })
    );
    let config: AirbyteConfig = undefined;
    dest.onConfigCheck(async (cfg: AirbyteConfig) => {
      config = cfg;
    });
    const main = dest.mainCommand().exitOverride();
    const res = await main
      .parseAsync(['node', 'main', 'check', '--config', configPath])
      .catch((e) => fail(e));
    expect(res.opts()).toEqual({});
    expect(config).toBeDefined();
  });
});
