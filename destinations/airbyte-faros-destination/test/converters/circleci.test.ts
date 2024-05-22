import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '../testing-tools';
import {circleciAllStreamsLog} from './data';
import {destinationWriteTest} from './utils';

describe('circleci', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/circleci/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__circleci__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({
      api_url: mockttp.url,
      source_specific_configs: {circleci: {skip_writing_test_cases: false}},
    });
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const expectedProcessedByStream = {
      pipelines: 1,
      projects: 1,
      tests: 2,
    };
    const expectedWrittenByModel = {
      cicd_Build: 1,
      cicd_BuildCommitAssociation: 1,
      cicd_BuildStep: 1,
      cicd_Organization: 1,
      cicd_Pipeline: 1,
      qa_TestCase: 2,
      qa_TestCaseResult: 2,
      qa_TestExecution: 1,
      qa_TestExecutionCommitAssociation: 1,
      qa_TestSuite: 1,
      qa_TestSuiteTestCaseAssociation: 2,
    };

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: circleciAllStreamsLog,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
    });
  });
});
