import _ from 'lodash';
import {getLocal} from 'mockttp';

import {CLI, read} from '../cli';
import {initMockttp, tempConfig, testLogger} from '../testing-tools';
import {azurereposAllStreamsLog} from './data';
import {assertProcessedAndWrittenModels} from './utils';

describe('azure-repos', () => {
  const logger = testLogger();
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/azure-repos/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__azure-repos__';

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
    cli.stdin.end(azurereposAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {
      repositories: 5,
      pull_requests: 2,
      users: 2,
      commits: 7,
    };
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const writtenByModel = {
      vcs_Branch: 5,
      vcs_BranchCommitAssociation: 7,
      vcs_Commit: 7,
      vcs_Membership: 2,
      vcs_Organization: 1,
      vcs_PullRequest: 2,
      vcs_PullRequestComment: 8,
      vcs_PullRequestReview: 2,
      vcs_Repository: 5,
      vcs_User: 2,
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
