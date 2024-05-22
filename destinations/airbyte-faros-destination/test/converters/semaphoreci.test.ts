import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '../testing-tools';
import {semaphoreciAllStreamLogs} from './data';
import {destinationWriteTest} from './utils';

describe('semaphoreci', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/semaphoreci/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__semaphoreci__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({api_url: mockttp.url});
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const expectedProcessedByStream = {
      projects: 1,
      pipelines: 5,
    };
    const expectedWrittenByModel = {
      cicd_Build: 5,
      cicd_BuildCommitAssociation: 5,
      cicd_BuildStep: 20,
      cicd_Organization: 1,
      cicd_Pipeline: 5,
      cicd_Repository: 1,
    };

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: semaphoreciAllStreamLogs,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
    });
  });
});
