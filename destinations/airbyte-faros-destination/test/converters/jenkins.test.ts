import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '../testing-tools';
import {jenkinsAllStreamsLog} from './data';
import {destinationWriteTest} from './utils';

describe('jenkins', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/jenkins/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__jenkins__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({api_url: mockttp.url});
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const expectedProcessedByStream = {
      jobs: 2,
      builds: 4,
    };
    const expectedWrittenByModel = {
      cicd_Build: 4,
      cicd_BuildCommitAssociation: 1,
      cicd_Organization: 6,
      cicd_Pipeline: 6,
    };

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: jenkinsAllStreamsLog,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
    });
  });

  test('process records from all streams with commits', async () => {
    configPath = await tempConfig({
      api_url: mockttp.url,
      source_specific_configs: {
        jenkins: {
          create_commit_records: true,
        },
      },
    });

    const expectedProcessedByStream = {
      jobs: 2,
      builds: 4,
    };
    const expectedWrittenByModel = {
      cicd_Build: 4,
      cicd_BuildCommitAssociation: 1,
      cicd_Organization: 6,
      cicd_Pipeline: 6,
      vcs_Commit: 1,
    };

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: jenkinsAllStreamsLog,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
    });
  });
});
