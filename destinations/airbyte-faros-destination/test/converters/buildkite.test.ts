import _ from 'lodash';
import {getLocal} from 'mockttp';

import {initMockttp, tempConfig, testLogger} from '../testing-tools';
import {CLI, read} from './../cli';
import {buildkiteAllStreamsLog} from './data';
import {assertProcessedAndWrittenModels} from './utils';

describe('buildkite', () => {
  const logger = testLogger();
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/buildkite/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__buildkite__';

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
    cli.stdin.end(buildkiteAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {
      builds: 2,
      organizations: 2,
      pipelines: 1,
    };
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const writtenByModel = {
      cicd_Build: 2,
      cicd_BuildCommitAssociation: 2,
      cicd_BuildStep: 2,
      cicd_Organization: 2,
      cicd_Pipeline: 1,
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
