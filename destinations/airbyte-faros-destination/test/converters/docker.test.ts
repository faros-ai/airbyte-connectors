import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '../testing-tools';
import {dockerAllStreamsLog} from './data';
import {destinationWriteTest} from './utils';

describe('docker', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/docker/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__docker__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({
      api_url: mockttp.url,
      source_specific_configs: {
        docker: {organization: 'test-org'},
      },
    });
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const expectedProcessedByStream = {tags: 1};
    const expectedWrittenByModel = {
      cicd_Artifact: 1,
      cicd_ArtifactCommitAssociation: 1,
      cicd_Organization: 1,
      cicd_Repository: 1,
    };

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: dockerAllStreamsLog,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
    });
  });
});
