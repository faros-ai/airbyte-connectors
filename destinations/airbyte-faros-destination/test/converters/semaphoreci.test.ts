import _ from 'lodash';
import {getLocal} from 'mockttp';

import {CLI, read} from '../cli';
import {initMockttp, tempConfig} from '../testing-tools';
import {semaphoreciAllStreamLogs} from './data';
import {assertProcessedAndWrittenModels} from './utils';

describe('semaphoreci', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/semaphoreci/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__semaphoreci__';

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
    cli.stdin.end(semaphoreciAllStreamLogs, 'utf8');

    const stdout = await read(cli.stdout);

    const processedByStream = {
      projects: 1,
      pipelines: 5,
    };
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();
    const writtenByModel = {
      cicd_Build: 5,
      cicd_BuildCommitAssociation: 5,
      cicd_BuildStep: 20,
      cicd_Organization: 1,
      cicd_Pipeline: 5,
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
