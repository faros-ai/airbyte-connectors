import {AirbyteLog, AirbyteLogLevel, AirbyteRecord} from 'faros-airbyte-cdk';
import fs from 'fs';
import _ from 'lodash';
import {getLocal} from 'mockttp';
import os from 'os';
import pino from 'pino';

import {InvalidRecordStrategy} from '../../src';
import {tempConfig} from '../temp';
import {CLI, read} from './../cli';
import {jiraAllStreamsLog, readTestResourceFile} from './data';

describe('jira', () => {
  const logger = pino({
    name: 'test',
    level: process.env.LOG_LEVEL ?? 'info',
    prettyPrint: {levelFirst: true},
  });
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/jira-catalog.json';
  const catalogRawPath = 'test/resources/jira-catalog-raw.json';
  let configPath: string;
  const graphSchema = JSON.parse(readTestResourceFile('graph-schema.json'));
  const revisionId = 'test-revision-id';
  const streamNamePrefix = 'mytestsource__jira__';

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
    cli.stdin.end(jiraAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);
    expect(stdout).toMatch('\\"api_key\\":\\"REDACTED\\"');
    expect(stdout).toMatch('Read 688 messages');
    expect(stdout).toMatch('Read 584 records');
    expect(stdout).toMatch('Processed 584 records');
    expect(stdout).toMatch('Wrote 11 records');
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
    cli.stdin.end(jiraAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);
    expect(stdout).toMatch('Read 688 messages');
    expect(stdout).toMatch('Read 584 records');
    expect(stdout).toMatch('Processed 584 records');
    expect(stdout).toMatch('Would write 11 records');
    expect(stdout).toMatch('Errored 0 records');
    expect(await read(cli.stderr)).toBe('');
    expect(await cli.wait()).toBe(0);
  });

  test.skip('process raw records', async () => {
    const cli = await CLI.runWith([
      'write',
      '--config',
      configPath,
      '--catalog',
      catalogRawPath,
      '--dry-run',
    ]);
    cli.stdin.end(jiraAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);
    expect(stdout).toMatch('Processed 111 records');
    expect(stdout).toMatch('Would write 146 records');
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
        AirbyteRecord.make('mytestsource__jira__bad', {bad: 'dummy'})
      ) +
        os.EOL +
        JSON.stringify(
          AirbyteRecord.make('mytestsource__jira__something_else', {
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
        AirbyteRecord.make('mytestsource__jira__bad', {bad: 'dummy'})
      ) + os.EOL,
      'utf8'
    );
    const stdout = await read(cli.stdout);
    logger.debug(stdout);
    expect(stdout).toMatch('Processed 0 records');
    expect(stdout).toMatch('Would write 0 records');
    expect(stdout).toMatch('Errored 1 records');
    const stderr = await read(cli.stderr);
    expect(stderr).toMatch('Undefined stream mytestsource__jira__bad');
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
    cli.stdin.end(jiraAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {
      application_roles: 1,
      avatars: 65,
      boards: 1,
      board_issues: 4,
      dashboards: 2,
      filters: 4,
      filter_sharing: 4,
      groups: 11,
      jira_settings: 47,
      labels: 47,
      permissions: 41,
      permission_schemes: 5,
      screens: 22,
      screen_tabs: 22,
      screen_schemes: 19,
      sprints: 10,
      sprint_issues: 15,
      time_tracking: 2,
      users: 29,
      issues: 4,
      issue_fields: 74,
      issue_field_configurations: 1,
      issue_custom_field_contexts: 30,
      issue_link_types: 6,
      issue_navigator_settings: 11,
      issue_notification_schemes: 2,
      issue_priorities: 5,
      issue_resolutions: 4,
      issue_security_schemes: 1,
      issue_type_schemes: 10,
      issue_type_screen_schemes: 10,
      issue_votes: 4,
      issue_watchers: 4,
      projects: 1,
      project_avatars: 26,
      project_email: 1,
      project_permission_schemes: 1,
      project_types: 3,
      workflows: 13,
      workflow_schemes: 10,
      workflow_statuses: 8,
      workflow_status_categories: 4,
    };
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const writtenByModel = {
      tms_Project: 1,
      tms_Sprint: 10,
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
