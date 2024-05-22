import {getLocal} from 'mockttp';

import {initMockttp, sourceSpecificTempConfig} from '../testing-tools';
import {pagerdutyAllStreamsLog} from './data';
import {destinationWriteTest} from './utils';

describe('pagerduty', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/pagerduty/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__pagerduty__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await sourceSpecificTempConfig(mockttp.url, {
      pagerduty: {associate_applications_to_teams: true},
    });
    await mockttp
      .forPost('/graphs/test-graph/graphql')
      .once()
      .thenReply(
        200,
        JSON.stringify({
          data: {
            org: {teams: {edges: [{node: {uid: 'eng', name: 'Engineering'}}]}},
          },
        })
      );
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const expectedProcessedByStream = {
      incident_log_entries: 3,
      incidents: 3,
      services: 1,
      users: 1,
    };
    const expectedWrittenByModel = {
      compute_Application: 2,
      ims_Incident: 3,
      ims_IncidentApplicationImpact: 3,
      ims_IncidentAssignment: 3,
      ims_IncidentEvent: 3,
      ims_User: 1,
      org_ApplicationOwnership: 1,
    };

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: pagerdutyAllStreamsLog,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
    });
  });
});
