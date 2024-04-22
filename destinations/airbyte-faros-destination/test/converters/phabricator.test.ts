import _ from 'lodash';
import {getLocal} from 'mockttp';

import {CLI, read} from '../cli';
import {initMockttp, tempConfig, testLogger} from '../testing-tools';
import {phabricatorAllStreamsLog} from './data';
import {assertProcessedAndWrittenModels} from './utils';

describe('phabricator', () => {
  const logger = testLogger();
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/phabricator/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__phabricator__';

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
    cli.stdin.end(phabricatorAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {
      commits: 7,
      projects: 4,
      repositories: 2,
      revision_diffs: 1,
      revisions: 3,
      transactions: 3,
      users: 4,
    };
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const writtenByModel = {
      tms_Project: 4,
      tms_TaskBoard: 4,
      tms_TaskBoardProjectRelationship: 4,
      vcs_Branch: 2,
      vcs_BranchCommitAssociation: 7,
      vcs_Commit: 7,
      vcs_File: 5,
      vcs_Membership: 4,
      vcs_Organization: 2,
      vcs_PullRequest: 3,
      vcs_PullRequestFile: 5,
      vcs_PullRequestReview: 2,
      vcs_PullRequest__Update: 5,
      vcs_Repository: 2,
      vcs_User: 4,
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
