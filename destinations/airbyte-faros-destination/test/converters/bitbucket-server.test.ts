import {AirbyteLog, AirbyteLogLevel} from 'faros-airbyte-cdk';
import _ from 'lodash';
import {getLocal} from 'mockttp';

import {CLI, read} from '../cli';
import {initMockttp, tempConfig, testLogger} from '../testing-tools';
import {bitbucketServerAllStreamsLog} from './data';
import {assertProcessedAndWrittenModels} from "./utils";

describe('bitbucket-server', () => {
  const logger = testLogger();
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/bitbucket-server/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__bitbucket-server__';

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
    cli.stdin.end(bitbucketServerAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {
      commits: 8,
      pull_request_activities: 18,
      pull_request_diffs: 3,
      pull_requests: 3,
      repositories: 1,
      project_users: 3,
      projects: 1,
      tags: 1,
    };
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const writtenByModel = {
      vcs_Commit: 7,
      vcs_File: 3,
      vcs_Membership: 4,
      vcs_Organization: 1,
      vcs_PullRequest: 3,
      vcs_PullRequestComment: 5,
      vcs_PullRequestFile: 3,
      vcs_PullRequestReview: 5,
      vcs_PullRequest__Update: 5,
      vcs_Repository: 1,
      vcs_Tag: 1,
      vcs_User: 4,
    };

    await assertProcessedAndWrittenModels(processedByStream, writtenByModel, stdout, processed, cli);
  });
});
