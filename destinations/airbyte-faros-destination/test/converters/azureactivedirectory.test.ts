import _ from 'lodash';
import {getLocal} from 'mockttp';

import {initMockttp, tempConfig, testLogger} from '../testing-tools';
import {CLI, read} from './../cli';
import {azureactivedirectoryAllStreamsLog} from './data';
import {assertProcessedAndWrittenModels} from './utils';

describe('azureactivedirectory', () => {
  const logger = testLogger();
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/azureactivedirectory/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__azureactivedirectory__';

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
    cli.stdin.end(azureactivedirectoryAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {
      groups: 1,
      users: 2,
    };
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const writtenByModel = {
      geo_Address: 1,
      geo_Location: 1,
      identity_Identity: 2,
      org_Department: 1,
      org_Employee: 2,
      org_Team: 1,
      org_TeamMembership: 2,
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
