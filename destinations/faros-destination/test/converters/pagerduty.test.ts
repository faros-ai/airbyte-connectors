import {AirbyteLog, AirbyteLogLevel, AirbyteRecord} from 'faros-airbyte-cdk';
import fs from 'fs';
import _ from 'lodash';
import {getLocal} from 'mockttp';
import os from 'os';
import pino from 'pino';

import {InvalidRecordStrategy} from '../../src';
import {tempConfig} from '../temp';
import {CLI, read} from './../cli';
import {pagerdutyLog, readTestResourceFile} from './data';

describe('pagerduty', () => {
  const logger = pino({
    name: 'test',
    level: process.env.LOG_LEVEL ?? 'info',
    prettyPrint: {levelFirst: true},
  });
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/pagerduty/catalog.json';
  let configPath: string;
  const graphSchema = JSON.parse(readTestResourceFile('graph-schema.json'));
  const revisionId = 'test-revision-id';
  const streamNamePrefix = 'mytestsource__pagerduty__';

  beforeEach(async () => {
    await mockttp.start({startPort: 30000, endPort: 50000});
    configPath = await tempConfig(mockttp.url);
  });

  afterEach(async () => {
    await mockttp.stop();
    fs.unlinkSync(configPath);
  });

  test('process and write records', async () => {
    await mockttp
      .post('/graphs/test-graph/models')
      .withQuery({schema: 'canonical'})
      .once()
      .thenReply(200, JSON.stringify({}));

    await mockttp
      .post('/graphs/test-graph/revisions')
      .once()
      .thenReply(
        200,
        JSON.stringify({
          entrySchema: graphSchema,
          revision: {uid: revisionId, lock: {state: {}}},
        })
      );

    let entriesSize = 0;
    await mockttp
      .post(`/graphs/test-graph/revisions/${revisionId}/entries`)
      .thenCallback(async (r) => {
        entriesSize = r.body.buffer.length;
        return {statusCode: 204};
      });

    await mockttp
      .patch(`/graphs/test-graph/revisions/${revisionId}`)
      .withJsonBodyIncluding({status: 'active'})
      .once()
      .thenReply(204);

    const cli = await CLI.runWith([
      'write',
      '--config',
      configPath,
      '--catalog',
      catalogPath,
    ]);
    cli.stdin.end(pagerdutyLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);
    expect(stdout).toMatch('\\"api_key\\":\\"REDACTED\\"');
    expect(stdout).toMatch('Read 7 messages');
    expect(stdout).toMatch('Read 7 records');
    expect(stdout).toMatch('Processed 7 records');
    expect(stdout).toMatch('Wrote 16 records');
    expect(stdout).toMatch('Errored 0 records');
    expect(await read(cli.stderr)).toBe('');
    expect(await cli.wait()).toBe(0);
    expect(entriesSize).toBeGreaterThan(0);
  });

  test('process records but skip writes when dry run is enabled', async () => {
    const cli = await CLI.runWith([
      'write',
      '--config',
      configPath,
      '--catalog',
      catalogPath,
      '--dry-run',
    ]);
    cli.stdin.end(pagerdutyLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);
    expect(stdout).toMatch('Read 7 messages');
    expect(stdout).toMatch('Read 7 records');
    expect(stdout).toMatch('Processed 7 records');
    expect(stdout).toMatch('Would write 16 records');
    expect(stdout).toMatch('Errored 0 records');
    expect(await read(cli.stderr)).toBe('');
    expect(await cli.wait()).toBe(0);
  });

  test('skip to process bad records when strategy is skip', async () => {
    const cli = await CLI.runWith([
      'write',
      '--config',
      configPath,
      '--catalog',
      catalogPath,
      '--dry-run',
    ]);
    cli.stdin.end(
      JSON.stringify(
        AirbyteRecord.make('mytestsource__pagerduty__bad', {bad: 'dummy'})
      ) +
        os.EOL +
        JSON.stringify(
          AirbyteRecord.make('mytestsource__pagerduty__something_else', {
            foo: 'bar',
          })
        ) +
        os.EOL,
      'utf8'
    );
    const stdout = await read(cli.stdout);
    logger.debug(stdout);
    expect(stdout).toMatch('Processed 1 records');
    expect(stdout).toMatch('Would write 1 records');
    expect(stdout).toMatch('Errored 1 records');
    expect(await read(cli.stderr)).toMatch('');
    expect(await cli.wait()).toBe(0);
  });

  test('fail to process bad records when strategy is fail', async () => {
    fs.unlinkSync(configPath);
    configPath = await tempConfig(mockttp.url, InvalidRecordStrategy.FAIL);
    const cli = await CLI.runWith([
      'write',
      '--config',
      configPath,
      '--catalog',
      catalogPath,
      '--dry-run',
    ]);
    cli.stdin.end(
      JSON.stringify(
        AirbyteRecord.make('mytestsource__pagerduty__bad', {bad: 'dummy'})
      ) + os.EOL,
      'utf8'
    );
    const stdout = await read(cli.stdout);
    logger.debug(stdout);
    expect(stdout).toMatch('Processed 0 records');
    expect(stdout).toMatch('Would write 0 records');
    expect(stdout).toMatch('Errored 1 records');
    const stderr = await read(cli.stderr);
    expect(stderr).toMatch('Undefined stream mytestsource__pagerduty__bad');
    expect(await cli.wait()).toBeGreaterThan(0);
  });

  test('process records from all streams', async () => {
    const cli = await CLI.runWith([
      'write',
      '--config',
      configPath,
      '--catalog',
      catalogPath,
      '--dry-run',
    ]);
    cli.stdin.end(pagerdutyLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {
      incident_log_entries: 3,
      incidents: 3,
      users: 1,
    };
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const writtenByModel = {
      compute_Application: 3,
      ims_IncidentApplicationImpact: 3,
      ims_IncidentAssignment: 3,
      ims_IncidentEvent: 3,
      ims_Incident__Upsert: 3,
      ims_User: 1,
    };

    const processedTotal = _(processedByStream).values().sum();
    const writtenTotal = _(writtenByModel).values().sum();
    expect(stdout).toMatch(`Processed ${processedTotal} records`);
    expect(stdout).toMatch(`Would write ${writtenTotal} records`);
    expect(stdout).toMatch('Errored 0 records');
    expect(stdout).toMatch(
      JSON.stringify(
        AirbyteLog.make(
          AirbyteLogLevel.INFO,
          `Processed records by stream: ${JSON.stringify(processed)}`
        )
      )
    );
    expect(stdout).toMatch(
      JSON.stringify(
        AirbyteLog.make(
          AirbyteLogLevel.INFO,
          `Would write records by model: ${JSON.stringify(writtenByModel)}`
        )
      )
    );
    expect(await read(cli.stderr)).toBe('');
    expect(await cli.wait()).toBe(0);
  });
});
