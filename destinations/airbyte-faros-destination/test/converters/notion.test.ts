import _ from 'lodash';
import {getLocal} from 'mockttp';

import {CLI, read} from '../cli';
import {
  initMockttp,
  sourceSpecificTempConfig,
  testLogger,
} from '../testing-tools';
import {notionAllStreamsLog} from './data';
import {assertProcessedAndWrittenModels} from './utils';

describe('notion', () => {
  const logger = testLogger();
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const streamNamePrefix = 'mytestsource__notion__';
  const catalogPath = 'test/resources/notion/catalog.json';
  let configPath: string;

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await sourceSpecificTempConfig(mockttp.url, {
      notion: {
        kind_property: 'Kind',
        projects: {
          kind: 'Project',
        },
        epics: {
          kind: 'Epic',
        },
        sprints: {
          kind: 'Sprint',
        },
        tasks: {
          kind: 'Task',
          include_additional_properties: true,
          properties: {
            type: 'Task Type',
            status: {
              name: 'Status',
              mapping: {
                todo: ['Not started'],
                in_progress: ['In progress'],
                done: ['Done'],
              },
            },
          },
        },
      },
    });
  });

  afterEach(() => mockttp.stop());

  test('process records from all streams', async () => {
    const cli = await CLI.runWith([
      'write',
      '--config',
      configPath,
      '--catalog',
      catalogPath,
      '--dry-run',
    ]);
    cli.stdin.end(notionAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {pages: 8, users: 2};
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const writtenByModel = {
      tms_Epic: 2,
      tms_Project: 1,
      tms_Sprint: 2,
      tms_Task: 3,
      tms_TaskAssignment: 2,
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
