import {AirbyteLog, AirbyteLogLevel} from 'faros-airbyte-cdk';
import _ from 'lodash';
import {getLocal, MockedEndpoint} from 'mockttp';

import {Edition, InvalidRecordStrategy} from '../../src';
import {CLI, read} from '../cli';
import {initMockttp, tempConfig, testLogger} from '../testing-tools';
import {opsgenieAllStreamsLog} from './data';

describe('opsgenie', () => {
  const logger = testLogger();
  const mockttp = getLocal({debug: false, recordTraffic: true});
  const catalogPath = 'test/resources/opsgenie/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__opsgenie__';
  let segmentMock: MockedEndpoint;

  beforeEach(async () => {
    await initMockttp(mockttp);

    // Segment analytics mock
    segmentMock = await mockttp
      .forPost('/v1/batch')
      .once()
      .thenReply(200, JSON.stringify({}));

    configPath = await tempConfig(
      mockttp.url,
      InvalidRecordStrategy.SKIP,
      Edition.COMMUNITY
    );
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const cli = await CLI.runWith([
      'write',
      '--config',
      configPath,
      '--catalog',
      catalogPath,
      '--dry-run',
    ]);
    cli.stdin.end(opsgenieAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {
      incidents: 3,
      teams: 1,
      users: 2,
    };
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();
    const writtenByModel = {
      compute_Application: 1,
      ims_Incident: 3,
      ims_IncidentApplicationImpact: 1,
      ims_IncidentAssignment: 5,
      ims_IncidentEvent: 21,
      ims_IncidentTag: 3,
      ims_Label: 2,
      ims_Team: 1,
      ims_TeamIncidentAssociation: 2,
      ims_User: 2,
      tms_User: 2,
    };

    const processedTotal = _(processedByStream).values().sum();
    const writtenTotal = _(writtenByModel).values().sum();
    expect(stdout).toMatch(`Processed ${processedTotal} records`);
    expect(stdout).toMatch(`Would write ${writtenTotal} records`);
    expect(stdout).toMatch('Errored 0 records');
    expect(stdout).toMatch('Skipped 0 records');
    expect(stdout).toMatch(
      JSON.stringify(
        AirbyteLog.make(
          AirbyteLogLevel.INFO,
          `Processed records by stream: ${JSON.stringify(processed)}`
        )
      )
    );
    expect(stdout).toMatch(
      JSON.stringify(
        AirbyteLog.make(
          AirbyteLogLevel.INFO,
          `Would write records by model: ${JSON.stringify(writtenByModel)}`
        )
      )
    );
    expect(await read(cli.stderr)).toBe('');
    expect(await cli.wait()).toBe(0);

    const recordedRequests = await segmentMock.getSeenRequests();
    expect(recordedRequests.length).toBe(1);
    const body = await recordedRequests[0].body.getJson();
    expect(body).toStrictEqual({
      batch: [
        {
          _metadata: expect.anything(),
          context: expect.anything(),
          event: 'Write Stats',
          messageId: expect.anything(),
          properties: {
            messagesRead: 6,
            processedByStream: processed,
            recordsErrored: 0,
            recordsProcessed: processedTotal,
            recordsRead: 6,
            recordsSkipped: 0,
            recordsWritten: writtenTotal,
            writtenByModel,
          },
          timestamp: expect.anything(),
          type: 'track',
          userId: 'bacaf6e6-41d8-4102-a3a4-5d28100e642f',
        },
      ],
      sentAt: expect.anything(),
      timestamp: expect.anything(),
    });
  });
});
