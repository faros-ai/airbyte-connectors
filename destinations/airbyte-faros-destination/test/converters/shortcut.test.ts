import _ from 'lodash';
import {getLocal} from 'mockttp';

import {CLI, read} from '../cli';
import {initMockttp, tempConfig, testLogger} from '../testing-tools';
import {shortcutAllStreamsLog} from './data';
import {assertProcessedAndWrittenModels} from './utils';

describe('shortcut', () => {
  const logger = testLogger();
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/shortcut/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__shortcut__';

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
    cli.stdin.end(shortcutAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {
      epics: 1,
      iterations: 2,
      members: 1,
      projects: 3,
      stories: 2,
    };
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const writtenByModel = {
      tms_Epic: 1,
      tms_Label: 1,
      tms_Project: 3,
      tms_Sprint: 2,
      tms_Task: 4,
      tms_TaskBoard: 3,
      tms_TaskBoardProjectRelationship: 3,
      tms_TaskBoardRelationship: 2,
      tms_TaskDependency: 2,
      tms_TaskProjectRelationship: 2,
      tms_TaskTag: 1,
      tms_User: 1,
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
