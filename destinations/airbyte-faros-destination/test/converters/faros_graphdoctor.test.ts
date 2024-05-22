import {getLocal} from 'mockttp';

import {Edition, InvalidRecordStrategy} from '../../src';
import {initMockttp, tempConfig} from '../testing-tools';
import {farosGraphDoctorAllStreamsLog} from './data';
import {destinationWriteTest} from './utils';

describe.only('faros_graphdoctor', () => {
  const mockttp = getLocal({debug: false, recordTraffic: true});
  const catalogPath = 'test/resources/faros_graphdoctor/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__faros_graphdoctor__';

  beforeEach(async () => {
    await initMockttp(mockttp);

    configPath = await tempConfig({
      api_url: mockttp.url,
      invalid_record_strategy: InvalidRecordStrategy.SKIP,
      edition: Edition.CLOUD,
    });
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const expectedProcessedByStream = {
      data_quality_tests: 3,
    };
    const expectedWrittenByModel = {
      faros_DataQualityIssue: 3,
    };

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: farosGraphDoctorAllStreamsLog,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
    });
  });
});
