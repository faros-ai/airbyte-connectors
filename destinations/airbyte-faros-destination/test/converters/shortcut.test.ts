import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '../testing-tools';
import {shortcutAllStreamsLog} from './data';
import {destinationWriteTest} from './utils';

describe('shortcut', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/shortcut/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__shortcut__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({api_url: mockttp.url});
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const expectedProcessedByStream = {
      epics: 1,
      iterations: 2,
      members: 1,
      projects: 3,
      stories: 2,
    };
    const expectedWrittenByModel = {
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

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: shortcutAllStreamsLog,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
    });
  });
});
