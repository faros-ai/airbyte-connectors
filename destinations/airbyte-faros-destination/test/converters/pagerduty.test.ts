import _ from 'lodash';
import {getLocal} from 'mockttp';

import {CLI, read} from '../cli';
import {
  initMockttp,
  sourceSpecificTempConfig,
  testLogger,
} from '../testing-tools';
import {pagerdutyAllStreamsLog} from './data';
import {assertProcessedAndWrittenModels} from './utils';

describe('pagerduty', () => {
  const logger = testLogger();
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
    const cli = await CLI.runWith([
      'write',
      '--config',
      configPath,
      '--catalog',
      catalogPath,
      '--dry-run',
    ]);
    cli.stdin.end(pagerdutyAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {
      incident_log_entries: 3,
      incidents: 3,
      services: 1,
      users: 1,
    };
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const writtenByModel = {
      compute_Application: 2,
      ims_Incident: 3,
      ims_IncidentApplicationImpact: 3,
      ims_IncidentAssignment: 3,
      ims_IncidentEvent: 3,
      ims_User: 1,
      org_ApplicationOwnership: 1,
    };

    await assertProcessedAndWrittenModels(
      processedByStream,
      writtenByModel,
      stdout,
      processed,
      cli
    );
  });
});
