import {readFileSync} from 'fs';
import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '../testing-tools';
import {farosFeedsAllStreamsLog} from './data';
import {destinationWriteTest} from './utils';

describe('faros_feeds', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/faros_feeds/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__faros_feeds__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({api_url: mockttp.url});

    await mockttp
      .forPost('/graphs/test-graph/graphql')
      .once()
      .thenReply(
        200,
        readFileSync('test/resources/faros_feeds/schema.json', 'utf8')
      );
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const expectedProcessedByStream = {
      faros_feed: 1004,
    };
    const expectedWrittenByModel = {
      cicd_ReleaseTagAssociation__Deletion: 1,
      tms_Project__Deletion: 1,
      tms_TaskAssignment__Deletion: 1,
      tms_TaskBoard: 3,
      tms_TaskBoardProjectRelationship: 3,
      tms_TaskBoardProjectRelationship__Deletion: 1,
      vcs_Commit: 34,
      vcs_Label: 2,
      vcs_Membership: 166,
      vcs_PullRequest: 91,
      vcs_PullRequestLabel: 13,
      vcs_PullRequestReview: 437,
      vcs_Tag: 32,
      vcs_User: 217,
    };

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: farosFeedsAllStreamsLog,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
    });
  });
});
