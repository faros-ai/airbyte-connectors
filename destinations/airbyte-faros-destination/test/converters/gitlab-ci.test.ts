import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '../testing-tools';
import {gitlabCiAllStreamsLog} from './data';
import {destinationWriteTest} from './utils';

describe('gitlab-ci', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/gitlab-ci/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__gitlab-ci__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({api_url: mockttp.url});
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const expectedProcessedByStream = {
      groups: 5,
      projects: 8,
      pipelines: 9,
      jobs: 9,
    };
    const expectedWrittenByModel = {
      cicd_Build: 9,
      cicd_BuildCommitAssociation: 9,
      cicd_BuildStep: 9,
      cicd_Organization: 5,
      cicd_Pipeline: 8,
    };

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: gitlabCiAllStreamsLog,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
    });
  });
});
