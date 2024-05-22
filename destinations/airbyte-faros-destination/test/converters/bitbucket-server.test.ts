import _ from 'lodash';
import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '../testing-tools';
import {bitbucketServerAllStreamsLog} from './data';
import {destinationWriteTest} from './utils';

describe('bitbucket-server', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/bitbucket-server/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__bitbucket-server__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({api_url: mockttp.url});
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const expectedProcessedByStream = {
      commits: 8,
      pull_request_activities: 18,
      pull_request_diffs: 3,
      pull_requests: 3,
      repositories: 1,
      project_users: 3,
      projects: 1,
      tags: 1,
      users: 2,
    };
    const expectedWrittenByModel = {
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
      vcs_User: 6,
    };

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: bitbucketServerAllStreamsLog,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
    });
  });
});
