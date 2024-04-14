import _ from 'lodash';
import {getLocal} from 'mockttp';

import {CLI, read} from '../cli';
import {initMockttp, tempConfig, testLogger} from '../testing-tools';
import {backlogAllStreamsLog} from './data';
import {assertProcessedAndWrittenModels} from './utils';

describe('backlog', () => {
  const logger = testLogger();
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/backlog/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__backlog__';

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
    cli.stdin.end(backlogAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {
      issues: 3,
      projects: 1,
      users: 2,
    };
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const writtenByModel = {
      tms_Project: 1,
      tms_Release: 1,
      tms_Sprint: 2,
      tms_Task: 3,
      tms_TaskAssignment: 1,
      tms_TaskBoard: 1,
      tms_TaskBoardProjectRelationship: 1,
      tms_TaskBoardRelationship: 3,
      tms_TaskProjectRelationship: 3,
      tms_User: 2,
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
