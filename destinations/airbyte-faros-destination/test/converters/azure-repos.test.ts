import _ from 'lodash';
import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '../testing-tools';
import {azurereposAllStreamsLog} from './data';
import {destinationWriteTest} from './utils';

describe('azure-repos', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/azure-repos/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__azure-repos__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({api_url: mockttp.url});
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const expectedProcessedByStream = {
      repositories: 5,
      pull_requests: 2,
      users: 2,
      commits: 7,
    };
    const expectedWrittenByModel = {
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

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: azurereposAllStreamsLog,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
    });
  });
});
