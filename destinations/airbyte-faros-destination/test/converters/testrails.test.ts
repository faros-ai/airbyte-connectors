import _ from 'lodash';
import {getLocal} from 'mockttp';

import {Edition, InvalidRecordStrategy} from '../../src';
import {CLI, read} from '../cli';
import {initMockttp, tempConfig, testLogger} from '../testing-tools';
import {testrailsAllStreamsLog} from './data';
import {assertProcessedAndWrittenModels} from './utils';

describe('testrails', () => {
  const logger = testLogger();
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/testrails/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__testrails__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig(
      mockttp.url,
      InvalidRecordStrategy.SKIP,
      Edition.CLOUD,
      {},
      {}
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
    cli.stdin.end(testrailsAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {
      suites: 2,
      cases: 4,
      runs: 2,
      results: 4,
    };
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const writtenByModel = {
      qa_TestCase: 4,
      qa_TestCaseResult: 4,
      qa_TestExecution: 2,
      qa_TestSuite: 2,
      qa_TestSuiteTestCaseAssociation: 4,
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
