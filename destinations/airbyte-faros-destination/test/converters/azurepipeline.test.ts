import _ from 'lodash';
import {getLocal} from 'mockttp';

import {initMockttp, tempConfig, testLogger} from '../testing-tools';
import {CLI, read} from './../cli';
import {azurepipelineAllStreamsLog} from './data';
import {assertProcessedAndWrittenModels} from './utils';

describe('azurepipeline', () => {
  const logger = testLogger();
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/azurepipeline/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__azurepipeline__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig(mockttp.url);
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
    cli.stdin.end(azurepipelineAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {
      builds: 4,
      pipelines: 2,
      releases: 1,
    };
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const writtenByModel = {
      cicd_Build: 4,
      cicd_BuildCommitAssociation: 1,
      cicd_BuildStep: 6,
      cicd_Organization: 1,
      cicd_Pipeline: 2,
      cicd_Release: 1,
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
