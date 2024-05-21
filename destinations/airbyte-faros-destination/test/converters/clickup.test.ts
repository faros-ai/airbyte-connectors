import {getLocal} from 'mockttp';

import {initMockttp, sourceSpecificTempConfig} from '../testing-tools';
import {clickupAllStreamsLog} from './data';
import {destinationWriteTest} from './utils';

describe('clickup', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/clickup/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__clickup__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await sourceSpecificTempConfig(mockttp.url, {
      clickup: {taskboard_source: 'space'},
    });
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const expectedProcessedByStream = {
      folders: 2,
      goals: 2,
      lists: 5,
      spaces: 7,
      status_histories: 9,
      tasks: 9,
      workspaces: 3,
    };
    const expectedWrittenByModel = {
      tms_Label: 2,
      tms_Project: 3,
      tms_Task: 9,
      tms_TaskAssignment: 1,
      tms_TaskBoard: 7,
      tms_TaskBoardProjectRelationship: 7,
      tms_TaskBoardRelationship: 9,
      tms_TaskDependency: 1,
      tms_TaskProjectRelationship: 9,
      tms_TaskTag: 2,
      tms_Task__Update: 9,
      tms_User: 3,
    };

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: clickupAllStreamsLog,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
    });
  });
});
