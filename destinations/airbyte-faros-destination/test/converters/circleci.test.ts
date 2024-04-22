import _ from 'lodash';
import {getLocal} from 'mockttp';

import {Edition, InvalidRecordStrategy} from '../../src';
import {CLI, read} from '../cli';
import {initMockttp, tempConfig, testLogger} from '../testing-tools';
import {circleciAllStreamsLog} from './data';
import {assertProcessedAndWrittenModels} from './utils';

describe('circleci', () => {
  const logger = testLogger();
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/circleci/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__circleci__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig(
      mockttp.url,
      InvalidRecordStrategy.SKIP,
      Edition.CLOUD,
      undefined,
      {circleci: {skip_writing_test_cases: false}}
    );
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
    cli.stdin.end(circleciAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {
      pipelines: 1,
      projects: 1,
      tests: 2,
    };
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();
    const writtenByModel = {
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

    await assertProcessedAndWrittenModels(
      processedByStream,
      writtenByModel,
      stdout,
      processed,
      cli
    );
  });
});
