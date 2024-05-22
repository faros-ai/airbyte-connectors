import _ from 'lodash';
import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '../testing-tools';
import {buildkiteAllStreamsLog} from './data';
import {destinationWriteTest} from './utils';

describe('buildkite', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/buildkite/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__buildkite__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({api_url: mockttp.url});
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const expectedProcessedByStream = {
      builds: 2,
      organizations: 2,
      pipelines: 1,
    };
    const expectedWrittenByModel = {
      cicd_Build: 2,
      cicd_BuildCommitAssociation: 2,
      cicd_BuildStep: 2,
      cicd_Organization: 2,
      cicd_Pipeline: 1,
    };

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: buildkiteAllStreamsLog,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
    });
  });
});
