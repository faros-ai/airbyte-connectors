import {AirbyteLog, AirbyteLogLevel} from 'faros-airbyte-cdk';
import fs from 'fs';
import _ from 'lodash';
import {getLocal} from 'mockttp';
import pino from 'pino';

import {CLI, read} from '../cli';
import {initMockttp, tempConfig} from '../testing-tools';
import {bitbucketAllStreamsLog} from './data';

describe('bitbucket', () => {
  const logger = pino({
    name: 'test',
    level: process.env.LOG_LEVEL ?? 'info',
    prettyPrint: {levelFirst: true},
  });
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/bitbucket/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__bitbucket__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig(mockttp.url);
  });

  afterEach(async () => {
    await mockttp.stop();
    fs.unlinkSync(configPath);
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
    cli.stdin.end(bitbucketAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {
      branches: 2,
      commits: 25,
      deployments: 14,
      issues: 1,
      pipeline_steps: 5,
      pipelines: 7,
      pull_request_activities: 4,
      pull_requests: 2,
      repositories: 12,
      workspace_users: 5,
      workspaces: 3,
    };
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const writtenByModel = {
      cicd_Build: 7,
      cicd_BuildCommitAssociation: 7,
      cicd_Deployment: 14,
      cicd_Organization: 3,
      cicd_Repository: 12,
      tms_Project: 12,
      tms_Task: 1,
      tms_TaskAssignment: 1,
      tms_TaskBoard: 12,
      tms_TaskBoardProjectRelationship: 12,
      tms_TaskBoardRelationship: 1,
      tms_TaskProjectRelationship: 1,
      tms_User: 2,
      vcs_Branch: 2,
      vcs_Commit: 25,
      vcs_Membership: 5,
      vcs_Organization: 3,
      vcs_PullRequest: 2,
      vcs_Repository: 12,
      vcs_User: 29,
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
