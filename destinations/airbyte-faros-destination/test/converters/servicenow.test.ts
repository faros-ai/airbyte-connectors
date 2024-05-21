import _ from 'lodash';
import {getLocal, MockedEndpoint} from 'mockttp';

import {Edition} from '../../src';
import {Incidents} from '../../src/converters/servicenow/incidents';
import {SEGMENT_KEY} from '../../src/destination';
import {initMockttp, tempConfig} from '../testing-tools';
import {servicenowAllStreamsLog} from './data';
import {destinationWriteTest} from './utils';

describe('servicenow', () => {
  const mockttp = getLocal({debug: false, recordTraffic: true});
  const catalogPath = 'test/resources/servicenow/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__servicenow__';
  let segmentMock: MockedEndpoint;

  beforeEach(async () => {
    await initMockttp(mockttp);

    // Segment analytics mock
    segmentMock = await mockttp
      .forPost('/v1/batch')
      .once()
      .thenReply(200, JSON.stringify({}));

    configPath = await tempConfig({
      api_url: mockttp.url,
      edition: Edition.COMMUNITY,
    });
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const expectedProcessedByStream = {
      incidents: 2,
      users: 2,
    };
    const processed = _(expectedProcessedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();
    const expectedWrittenByModel = {
      compute_Application: 1,
      ims_Incident: 2,
      ims_IncidentApplicationImpact: 2,
      ims_IncidentAssignment: 2,
      ims_User: 2,
    };
    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: servicenowAllStreamsLog,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
    });

    const processedTotal = _(expectedProcessedByStream).values().sum();
    const writtenTotal = _(expectedWrittenByModel).values().sum();

    const recordedRequests = await segmentMock.getSeenRequests();
    expect(recordedRequests.length).toBe(1);
    const body = await recordedRequests[0].body.getJson();
    expect(body).toStrictEqual({
      batch: [
        {
          _metadata: expect.anything(),
          context: expect.anything(),
          event: 'Write Stats',
          integrations: {},
          messageId: expect.anything(),
          properties: {
            messagesRead: 4,
            processedByStream: processed,
            recordsErrored: 0,
            recordsProcessed: processedTotal,
            recordsRead: 4,
            recordsSkipped: 0,
            recordsWritten: writtenTotal,
            writtenByModel: expectedWrittenByModel,
          },
          timestamp: expect.anything(),
          type: 'track',
          userId: 'bacaf6e6-41d8-4102-a3a4-5d28100e642f',
        },
      ],
      sentAt: expect.anything(),
      writeKey: SEGMENT_KEY,
    });
  });
});

describe('incident/application association', () => {
  const incAppImpact = {
    incident: {uid: 'incident123', source: 'source1'},
    application: {name: 'app1', platform: 'platform1'},
  };

  const incAppImpacts = {
    incident123: new Set<string>(['app1_platform1']),
  };

  test('should return false if incident source does not match', () => {
    const result = Incidents.shouldDeleteRecord(
      incAppImpact,
      'differentSource',
      incAppImpacts
    );

    expect(result).toBe(false);
  });

  test('should return false if incident was not processed', () => {
    const result = Incidents.shouldDeleteRecord(
      {incident: {uid: 'unprocessed', source: 'source1'}},
      'source1',
      incAppImpacts
    );

    expect(result).toBe(false);
  });

  test('keeps new incident/application association', () => {
    const result = Incidents.shouldDeleteRecord(
      incAppImpact,
      'source1',
      incAppImpacts
    );

    expect(result).toBe(false);
  });

  test('deletes old associations of processed incidents', () => {
    const result = Incidents.shouldDeleteRecord(
      {
        incident: {uid: 'incident123', source: 'source1'},
        application: {name: 'app0', platform: 'platform0'},
      },
      'source1',
      incAppImpacts
    );

    expect(result).toBe(true);
  });
});
