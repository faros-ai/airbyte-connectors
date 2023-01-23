import {
  AirbyteConnectionStatus,
  AirbyteConnectionStatusMessage,
  AirbyteLog,
  AirbyteLogLevel,
} from 'faros-airbyte-cdk';
import _ from 'lodash';
import {getLocal} from 'mockttp';
import os from 'os';

import {Edition, InvalidRecordStrategy} from '../../src';
import {CLI, read} from '../cli';
import {initMockttp, tempConfig, testLogger} from '../testing-tools';
import {jiraAllStreamsLog} from './data';

describe('jira', () => {
  const logger = testLogger();
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/jira/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__jira__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig(
      mockttp.url,
      InvalidRecordStrategy.SKIP,
      Edition.CLOUD,
      {},
      {
        jira: {
          use_board_ownership: false,
          truncate_limit: 1000,
        },
      }
    );
  });

  afterEach(async () => {
    await mockttp.stop();
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
      boards: 1,
      board_issues: 4,
      epics: 1,
      sprints: 10,
      sprint_issues: 15,
      users: 29,
      issues: 5,
      issue_fields: 74,
      projects: 1,
      project_versions: 3,
      pull_requests: 1,
      workflow_statuses: 8,
    };
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const writtenByModel = {
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
    expect(stdout).toMatch('Skipped 0 records');
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
