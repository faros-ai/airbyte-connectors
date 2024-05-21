import _ from 'lodash';
import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '../testing-tools';
import {azurepipelineAllStreamsLog} from './data';
import {destinationWriteTest} from './utils';

describe('azurepipeline', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/azurepipeline/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__azurepipeline__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({api_url: mockttp.url});
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const expectedProcessedByStream = {
      builds: 4,
      pipelines: 2,
      releases: 1,
    };
    const expectedWrittenByModel = {
      cicd_Build: 4,
      cicd_BuildCommitAssociation: 1,
      cicd_BuildStep: 6,
      cicd_Organization: 1,
      cicd_Pipeline: 2,
      cicd_Release: 1,
    };

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: azurepipelineAllStreamsLog,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
    });
  });
});
