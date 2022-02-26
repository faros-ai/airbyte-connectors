import {
  AirbyteConnectionStatus,
  AirbyteConnectionStatusMessage,
  AirbyteSpec,
} from 'faros-airbyte-cdk';
import fs from 'fs';
import {getLocal} from 'mockttp';
import os from 'os';

import {Edition, InvalidRecordStrategy} from '../src';
import {CLI, read} from './cli';
import {initMockttp, tempConfig} from './testing-tools';

describe('index', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  let configPath: string;

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig(mockttp.url);
  });

  afterEach(async () => {
    await mockttp.stop();
    fs.unlinkSync(configPath);
  });

  test('help', async () => {
    const cli = await CLI.runWith(['--help']);
    expect(await read(cli.stderr)).toBe('');
    expect(await read(cli.stdout)).toMatch(/^Usage: main*/);
    expect(await cli.wait()).toBe(0);
  });

  test('spec', async () => {
    const cli = await CLI.runWith(['spec']);
    expect(await read(cli.stderr)).toBe('');
    expect(await read(cli.stdout)).toBe(
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      JSON.stringify(new AirbyteSpec(require('../resources/spec.json'))) +
        os.EOL
    );
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
    let configPath: string;
    try {
      configPath = await tempConfig(
        mockttp.url,
        InvalidRecordStrategy.SKIP,
        Edition.COMMUNITY
      );
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
    } finally {
      fs.unlinkSync(configPath);
    }
  });

  test('fail check on invalid segment user id', async () => {
    let configPath: string;
    try {
      configPath = await tempConfig(
        mockttp.url,
        InvalidRecordStrategy.SKIP,
        Edition.COMMUNITY,
        {segment_user_id: 'badid'}
      );
      const cli = await CLI.runWith(['check', '--config', configPath]);

      expect(await read(cli.stderr)).toBe('');
      expect(await read(cli.stdout)).toContain(
        'Segment User Id badid is not a valid UUID.'
      );
      expect(await cli.wait()).toBe(0);
    } finally {
      fs.unlinkSync(configPath);
    }
  });
});
