import _ from 'lodash';
import {getLocal} from 'mockttp';

import {Edition, InvalidRecordStrategy} from '../../src';
import {CLI, read} from '../cli';
import {initMockttp, tempConfig, testLogger} from '../testing-tools';
import {
  workdayV1StreamsLog,
  workdayV3StreamsLog,
  workdayV4StreamsLog,
} from './data';
import {assertProcessedAndWrittenModels} from './utils';

describe('workday', () => {
  const logger = testLogger();
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/workday/catalog.json';
  const streamNamePrefix = 'mytestsource__workday__';
  const getTempConfig = async (orgs_to_keep, orgs_to_ignore) => {
    return await tempConfig(
      mockttp.url,
      InvalidRecordStrategy.SKIP,
      Edition.CLOUD,
      {},
      {Orgs_To_Keep: orgs_to_keep, Orgs_To_Ignore: orgs_to_ignore}
    );
  };
  const runTest = async (
    configPath,
    processedByStream,
    writtenByModel,
    workdayStreamsLog
  ) => {
    const cli = await CLI.runWith([
      'write',
      '--config',
      configPath,
      '--catalog',
      catalogPath,
      '--dry-run',
    ]);
    cli.stdin.end(workdayStreamsLog, 'utf8');
    const stdout = await read(cli.stdout);
    logger.debug(stdout);
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    await assertProcessedAndWrittenModels(
      processedByStream,
      writtenByModel,
      stdout,
      processed,
      cli
    );
  };

  beforeEach(async () => {
    await initMockttp(mockttp);
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from customreports v1 stream accept all', async () => {
    const configPath = await getTempConfig(['Team A', 'Team B'], []);
    const processedByStream = {
      customreports: 3,
    };
    const writtenByModel = {
      geo_Location: 2,
      identity_Identity: 3,
      org_Employee: 3,
      org_Team: 2,
      org_TeamMembership: 3,
    };
    await runTest(
      configPath,
      processedByStream,
      writtenByModel,
      workdayV1StreamsLog
    );
  });

  test('process records from customreports v1 stream reject all', async () => {
    const configPath = await getTempConfig([], ['Team A', 'Team B']);
    const processedByStream = {
      customreports: 3,
    };
    const writtenByModel = {};
    await runTest(
      configPath,
      processedByStream,
      writtenByModel,
      workdayV1StreamsLog
    );
  });

  test('process randomly generated records from customreports v3 stream', async () => {
    const configPath = await getTempConfig([], []);
    const processedByStream = {
      customreports: 100,
    };
    const writtenByModel = {
      geo_Location: 4,
      identity_Identity: 100,
      org_Employee: 100,
      org_Team: 4,
      org_TeamMembership: 100,
    };
    await runTest(
      configPath,
      processedByStream,
      writtenByModel,
      workdayV3StreamsLog
    );
  });
  test('process structured generated records from customreports v4 stream', async () => {
    const configPath = await getTempConfig([], []);
    const processedByStream = {
      customreports: 100,
    };
    const writtenByModel = {
      geo_Location: 4,
      identity_Identity: 99,
      org_Employee: 99,
      org_Team: 12,
      org_TeamMembership: 99,
    };
    await runTest(
      configPath,
      processedByStream,
      writtenByModel,
      workdayV4StreamsLog
    );
  });
  test('Saved and Ignored structured generated records v4 stream', async () => {
    // Teams are:
    const configPath = await getTempConfig(
      ['TopDog', 'Engineering', 'Security'],
      ['ChiefExecs']
    );
    const processedByStream = {
      customreports: 100,
    };
    const writtenByModel = {
      geo_Location: 4,
      identity_Identity: 79,
      org_Employee: 79,
      org_Team: 9,
      org_TeamMembership: 79,
    };
    await runTest(
      configPath,
      processedByStream,
      writtenByModel,
      workdayV4StreamsLog
    );
  });

  test('Saved and Ignored structured generated records v4 stream', async () => {
    // Teams are:
    const configPath = await getTempConfig(
      ['TopDog', 'Engineering', 'Security'],
      ['ChiefExecs']
    );
    const processedByStream = {
      customreports: 100,
    };
    const writtenByModel = {
      geo_Location: 4,
      identity_Identity: 79,
      org_Employee: 79,
      org_Team: 9,
      org_TeamMembership: 79,
    };
    await runTest(
      configPath,
      processedByStream,
      writtenByModel,
      workdayV4StreamsLog
    );
  });
});
