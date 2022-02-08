import {
  AirbyteConnectionStatus,
  AirbyteConnectionStatusMessage,
  AirbyteLog,
  AirbyteLogLevel,
} from 'faros-airbyte-cdk';
import fs from 'fs';
import _ from 'lodash';
import {getLocal} from 'mockttp';
import os from 'os';
import pino from 'pino';

import {InvalidRecordStrategy} from '../../src';
import {tempConfig} from '../temp';
import {CLI, read} from './../cli';
import {jiraAllStreamsLog} from './data';
import {initMockttp} from './mockttp';

describe('jira', () => {
  const logger = pino({
    name: 'test',
    level: process.env.LOG_LEVEL ?? 'info',
    prettyPrint: {levelFirst: true},
  });
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/jira/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__jira__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig(mockttp.url, InvalidRecordStrategy.SKIP, {
      jira: {
        use_board_ownership: false,
        truncate_limit: 1000,
      },
    });
  });

  afterEach(async () => {
    await mockttp.stop();
    fs.unlinkSync(configPath);
  });

  test('check valid jira source config', async () => {
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
      epics: 1,
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
      issues: 5,
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
      project_versions: 3,
      pull_requests: 1,
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
      generic_Record: 438,
      tms_Epic: 1,
      tms_Project: 1,
      tms_ProjectReleaseRelationship: 3,
      tms_Release: 3,
      tms_Sprint: 10,
      tms_Task: 5,
      tms_TaskAssignment: 1,
      tms_TaskBoard: 1,
      tms_TaskBoardProjectRelationship: 1,
      tms_TaskBoardRelationship: 5,
      tms_TaskDependency: 1,
      tms_TaskProjectRelationship: 5,
      tms_TaskPullRequestAssociation: 2,
      tms_TaskReleaseRelationship__Deletion: 1,
      tms_TaskReleaseRelationship__Upsert: 3,
      tms_TaskTag: 2,
      tms_User: 29,
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
