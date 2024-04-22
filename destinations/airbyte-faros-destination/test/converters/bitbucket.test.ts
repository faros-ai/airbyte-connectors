import _ from 'lodash';
import {getLocal} from 'mockttp';

import {CLI, read} from '../cli';
import {initMockttp, tempConfig, testLogger} from '../testing-tools';
import {bitbucketAllStreamsLog} from './data';
import {assertProcessedAndWrittenModels} from './utils';

describe('bitbucket', () => {
  const logger = testLogger();
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
      pull_request_activities: 12,
      pull_requests: 2,
      repositories: 6,
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
      cicd_Repository: 6,
      compute_Application: 7,
      tms_Project: 6,
      tms_Task: 1,
      tms_TaskAssignment: 1,
      tms_TaskBoard: 6,
      tms_TaskBoardProjectRelationship: 6,
      tms_TaskBoardRelationship: 1,
      tms_TaskProjectRelationship: 1,
      tms_User: 2,
      vcs_Branch: 2,
      vcs_Commit: 25,
      vcs_Membership: 5,
      vcs_Organization: 3,
      vcs_PullRequest: 2,
      vcs_PullRequestComment: 2,
      vcs_PullRequestReview: 3,
      vcs_Repository: 6,
      vcs_User: 33,
    };

    await assertProcessedAndWrittenModels(
      processedByStream,
      writtenByModel,
      stdout,
      processed,
      cli
    );
  });
});
