import _ from 'lodash';
import {getLocal} from 'mockttp';

import {Edition, InvalidRecordStrategy} from '../../src';
import {CLI, read} from '../cli';
import {initMockttp, tempConfig, testLogger} from '../testing-tools';
import {dockerAllStreamsLog} from './data';
import {assertProcessedAndWrittenModels} from './utils';

describe('docker', () => {
  const logger = testLogger();
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/docker/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__docker__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig(
      mockttp.url,
      InvalidRecordStrategy.SKIP,
      Edition.CLOUD,
      undefined,
      {
        docker: {organization: 'test-org'},
      }
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
    cli.stdin.end(dockerAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {tags: 1};
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const writtenByModel = {
      cicd_Artifact: 1,
      cicd_ArtifactCommitAssociation: 1,
      cicd_Organization: 1,
      cicd_Repository: 1,
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
