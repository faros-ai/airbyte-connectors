import {AirbyteLog, AirbyteLogLevel, AirbyteRecord} from 'faros-airbyte-cdk';
import _ from 'lodash';
import {getLocal} from 'mockttp';
import os from 'os';
import pino from 'pino';

import {InvalidRecordStrategy} from '../../src/destination';
import {CLI, read} from '../cli';
import {initMockttp, readTestResourceFile, tempConfig} from '../testing-tools';
import {gitlabAllStreamsLog, gitlabLog, gitlabPGRawLog} from './data';

describe('gitlab', () => {
  const logger = pino({
    name: 'test',
    level: process.env.LOG_LEVEL ?? 'info',
    prettyPrint: {levelFirst: true},
  });
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/gitlab/catalog.json';
  const catalogRawPath = 'test/resources/gitlab/catalog-raw.json';
  let configPath: string;
  const graphSchema = JSON.parse(readTestResourceFile('graph-schema.json'));
  const revisionId = 'test-revision-id';
  const streamNamePrefix = 'mytestsource__gitlab__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig(mockttp.url);
  });

  afterEach(async () => {
    await mockttp.stop();
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
    cli.stdin.end(gitlabAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {
      branches: 7,
      commits: 2,
      group_labels: 2,
      group_milestones: 1,
      groups: 1,
      issues: 2,
      jobs: 8,
      merge_request_commits: 6,
      merge_requests: 6,
      pipelines: 2,
      project_labels: 12,
      project_milestones: 2,
      projects: 1,
      releases: 1,
      tags: 1,
      users: 1,
    };
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const writtenByModel = {
      cicd_Build: 2,
      cicd_BuildStep: 8,
      cicd_Organization: 1,
      cicd_Pipeline: 1,
      cicd_Release: 1,
      cicd_ReleaseTagAssociation: 1,
      tms_Epic: 3,
      tms_Label: 15,
      tms_Project: 1,
      tms_Task: 2,
      tms_TaskAssignment: 1,
      tms_TaskBoard: 1,
      tms_TaskBoardProjectRelationship: 1,
      tms_TaskBoardRelationship: 2,
      tms_TaskProjectRelationship: 2,
      tms_TaskTag: 1,
      vcs_Branch: 7,
      vcs_BranchCommitAssociation: 7,
      vcs_Commit: 8,
      vcs_Organization: 1,
      vcs_PullRequest: 6,
      vcs_Repository: 1,
      vcs_Tag: 1,
      vcs_User: 1,
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
