import {getLocal} from 'mockttp';

import {initMockttp, sourceSpecificTempConfig} from '../testing-tools';
import {notionAllStreamsLog} from './data';
import {destinationWriteTest} from './utils';

describe('notion', () => {
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
    const expectedProcessedByStream = {pages: 8, users: 2};
    const expectedWrittenByModel = {
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

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: notionAllStreamsLog,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
    });
  });
});
