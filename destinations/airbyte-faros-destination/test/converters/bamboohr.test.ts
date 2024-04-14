import _ from 'lodash';
import {getLocal} from 'mockttp';

import {Edition, InvalidRecordStrategy} from '../../src';
import {CLI, read} from '../cli';
import {initMockttp, tempConfig, testLogger} from '../testing-tools';
import {bamboohrAllStreamsLog} from './data';
import {assertProcessedAndWrittenModels} from './utils';

describe('bamboohr', () => {
  const logger = testLogger();
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/bamboohr/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__bamboohr__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig(
      mockttp.url,
      InvalidRecordStrategy.SKIP,
      Edition.CLOUD,
      {},
      {
        bamboohr: {
          bootstrap_teams_from_managers: true,
          inactive_employment_history_status: ['Terminated', 'On-Leave'],
        },
      }
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
    cli.stdin.end(bamboohrAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {
      users: 87,
    };
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const writtenByModel = {
      geo_Address: 87,
      geo_Location: 87,
      identity_Identity: 87,
      org_Department: 9,
      org_Employee: 87,
      org_Team: 26,
      org_TeamMembership: 110,
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
