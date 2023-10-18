import _ from 'lodash';
import {getLocal} from 'mockttp';

import {Edition, InvalidRecordStrategy} from '../../src';
import {CLI, read} from '../cli';
import {initMockttp, tempConfig, testLogger} from '../testing-tools';
import {farosGraphDoctorAllStreamsLog} from './data';
import {assertProcessedAndWrittenModels} from './utils';

describe.only('faros_graphdoctor', () => {
  const logger = testLogger();
  const mockttp = getLocal({debug: false, recordTraffic: true});
  const catalogPath = 'test/resources/faros_graphdoctor/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__faros_graphdoctor__';

  beforeEach(async () => {
    await initMockttp(mockttp);

    configPath = await tempConfig(
      mockttp.url,
      InvalidRecordStrategy.SKIP,
      Edition.CLOUD
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
    cli.stdin.end(farosGraphDoctorAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {
      data_quality_tests: 3,
    };
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const writtenByModel = {
      faros_DataQualityIssue: 3,
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
