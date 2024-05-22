import _ from 'lodash';
import {getLocal} from 'mockttp';

import {Edition, InvalidRecordStrategy} from '../../src';
import {initMockttp, tempConfig} from '../testing-tools';
import {farosJiraAllStreamsLog} from './data';
import {destinationWriteTest} from './utils';

describe('faros_jira', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/faros_jira/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__jira__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({
      api_url: mockttp.url,
      log_records: true,
    });
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const expectedProcessedByStream = {
      faros_board_issues: 1,
    };
    const expectedWrittenByModel = {
      tms_TaskBoardRelationship: 1,
    };

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: farosJiraAllStreamsLog,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
      checkRecordsData: (records) => expect(records).toMatchSnapshot(),
    });
  });
});
