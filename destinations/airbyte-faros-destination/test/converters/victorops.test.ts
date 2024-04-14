import _ from 'lodash';
import {getLocal} from 'mockttp';

import {CLI, read} from '../cli';
import {initMockttp, tempConfig, testLogger} from '../testing-tools';
import {victoropsAllStreamsLog} from './data';
import {assertProcessedAndWrittenModels} from './utils';

describe('victorops', () => {
  const logger = testLogger();
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/victorops/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__victorops__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig(mockttp.url);
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
    cli.stdin.end(victoropsAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {
      incidents: 2,
      teams: 2,
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
      ims_Incident: 2,
      ims_IncidentApplicationImpact: 2,
      ims_IncidentAssignment: 2,
      ims_IncidentEvent: 4,
      ims_Team: 2,
      ims_TeamIncidentAssociation: 2,
      ims_User: 1,
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
