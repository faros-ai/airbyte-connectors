import {
  AirbyteConnectionStatus,
  AirbyteConnectionStatusMessage,
} from 'faros-airbyte-cdk';
import {getLocal} from 'mockttp';
import os from 'os';

import {CLI, read} from '../cli';
import {initMockttp, tempConfig} from '../testing-tools';
import {jiraAllStreamsLog} from './data';
import {destinationWriteTest} from './utils';

describe('jira', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/jira/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__jira__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({
      api_url: mockttp.url,
      edition_configs: {},
      source_specific_configs: {
        jira: {
          use_board_ownership: false,
          truncate_limit: 1000,
        },
      },
    });
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
    const expectedProcessedByStream = {
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
      workflow_statuses: 8,
      faros_issue_pull_requests: 1,
      faros_sprint_reports: 3,
      faros_board_issues: 4,
      faros_sprints: 1,
      faros_users: 3,
      faros_projects: 3,
      faros_boards: 2,
      faros_project_versions: 2,
      faros_project_version_issues: 2,
    };
    const expectedWrittenByModel = {
      tms_Epic: 1,
      tms_Project: 4,
      tms_ProjectReleaseRelationship: 5,
      tms_Release: 5,
      tms_Sprint: 11,
      tms_SprintBoardRelationship: 1,
      tms_SprintHistory: 12,
      tms_Task: 5,
      tms_TaskAssignment: 1,
      tms_TaskBoard: 3,
      tms_TaskBoardProjectRelationship: 3,
      tms_TaskBoardRelationship: 5,
      tms_TaskDependency: 1,
      tms_TaskProjectRelationship: 5,
      tms_TaskPullRequestAssociation: 1,
      tms_TaskReleaseRelationship: 2,
      tms_TaskReleaseRelationship__Deletion: 1,
      tms_TaskReleaseRelationship__Upsert: 3,
      tms_TaskTag: 2,
      tms_User: 32,
    };

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: jiraAllStreamsLog,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
    });
  });
});
