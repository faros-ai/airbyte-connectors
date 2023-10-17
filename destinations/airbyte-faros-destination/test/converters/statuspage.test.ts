import {AirbyteLog, AirbyteLogLevel} from 'faros-airbyte-cdk';
import _ from 'lodash';
import {getLocal} from 'mockttp';

import {CLI, read} from '../cli';
import {initMockttp, tempConfig, testLogger} from '../testing-tools';
import {statuspageAllStreamsLog} from './data';
import {assertProcessedAndWrittenModels} from "./utils";

describe('statuspage', () => {
  const logger = testLogger();
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/statuspage/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__statuspage__';

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
    cli.stdin.end(statuspageAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {
      component_groups: 3,
      components: 9,
      incidents: 5,
      pages: 1,
      users: 1,
      component_uptimes: 5,
    };
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const writtenByModel = {
      compute_Application: 6,
      ims_ApplicationUptime: 5,
      ims_Incident: 5,
      ims_IncidentApplicationImpact: 7,
      ims_IncidentEvent: 14,
      ims_User: 1,
    };

    await assertProcessedAndWrittenModels(processedByStream, writtenByModel, stdout, processed, cli);
  });
});
