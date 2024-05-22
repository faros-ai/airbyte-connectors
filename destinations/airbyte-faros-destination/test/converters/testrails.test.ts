import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '../testing-tools';
import {testrailsAllStreamsLog} from './data';
import {destinationWriteTest} from './utils';

describe('testrails', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/testrails/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__testrails__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({api_url: mockttp.url});
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const expectedProcessedByStream = {
      suites: 2,
      cases: 4,
      runs: 2,
      results: 4,
    };
    const expectedWrittenByModel = {
      qa_TestCase: 4,
      qa_TestCaseResult: 4,
      qa_TestExecution: 2,
      qa_TestSuite: 2,
      qa_TestSuiteTestCaseAssociation: 4,
    };

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: testrailsAllStreamsLog,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
    });
  });
});
