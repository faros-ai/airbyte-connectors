import _ from 'lodash';
import {getLocal} from 'mockttp';

import {CLI, read} from '../cli';
import {initMockttp, tempConfig, testLogger} from '../testing-tools';
import {gitlabCiAllStreamsLog} from './data';
import {assertProcessedAndWrittenModels} from './utils';

describe('gitlab-ci', () => {
  const logger = testLogger();
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/gitlab-ci/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__gitlab-ci__';

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
    cli.stdin.end(gitlabCiAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {
      groups: 5,
      projects: 8,
      pipelines: 9,
      jobs: 9,
    };

    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const writtenByModel = {
      cicd_Build: 9,
      cicd_BuildCommitAssociation: 9,
      cicd_BuildStep: 9,
      cicd_Organization: 5,
      cicd_Pipeline: 8,
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
