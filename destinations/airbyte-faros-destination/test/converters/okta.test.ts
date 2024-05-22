import _ from 'lodash';
import {getLocal, MockedEndpoint} from 'mockttp';

import {Edition, InvalidRecordStrategy} from '../../src';
import {SEGMENT_KEY} from '../../src/destination';
import {initMockttp, tempConfig} from '../testing-tools';
import {oktaAllStreamsLog} from './data';
import {destinationWriteTest} from './utils';

describe('okta', () => {
  const mockttp = getLocal({debug: false, recordTraffic: true});
  const catalogPath = 'test/resources/okta/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__okta__';
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
      invalid_record_strategy: InvalidRecordStrategy.SKIP,
      edition: Edition.COMMUNITY,
    });
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const expectedProcessedByStream = {
      groups: 2,
      users: 1,
    };
    const processed = _(expectedProcessedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();
    const expectedWrittenByModel = {
      identity_Identity: 1,
      org_Department: 1,
      org_Employee: 1,
      org_Team: 2,
      org_TeamMembership: 2,
    };

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: oktaAllStreamsLog,
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
            messagesRead: 3,
            processedByStream: processed,
            recordsErrored: 0,
            recordsProcessed: processedTotal,
            recordsRead: 3,
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
