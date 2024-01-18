import {AirbyteLogger, AirbyteLogLevel} from 'faros-airbyte-cdk';
import _ from 'lodash';
import {getLocal, Mockttp} from 'mockttp';

import {
  DestinationRecord,
  Edition,
  InvalidRecordStrategy,
  StreamContext,
} from '../../src';
import {Customreports} from '../../src/converters/workday/customreports';
import {CLI, read} from '../cli';
import {
  getConf,
  initMockttp,
  readTestResourceFile,
  tempConfig,
  testLogger,
} from '../testing-tools';
import {
  workdayV1StreamsLog,
  workdayV3StreamsLog,
  workdayV4StreamsLog,
} from './data';
import {assertProcessedAndWrittenModels} from './utils';

function updateCustomReportWithFields(
  crDest: Customreports,
  k: string
): Customreports {
  const testFieldsInput: Record<string, Record<string, any>> = JSON.parse(
    readTestResourceFile('workday/testFieldsInputs.json')
  );
  if (!(k in testFieldsInput)) {
    throw new Error(`Key ${k} missing from testFieldsInput`);
  }
  const fieldNameToValue: Record<string, any> = testFieldsInput[k];
  const fieldNames = [
    'teamIDToManagerIDs',
    'employeeIDtoRecord',
    'cycleChains',
    'generalLogCollection',
  ];
  for (const fieldName of fieldNames) {
    if (!(fieldName in fieldNameToValue)) {
      throw new Error(`Field name ${fieldName} missing from fieldValues`);
    }
    crDest.setField(fieldName, fieldNameToValue[fieldName]);
  }
  return crDest;
}

function getCustomReportandCtxGivenKey(
  mockttp: Mockttp,
  k: string
): [Customreports, StreamContext] {
  const customReportDestination = new Customreports();
  const orgs_to_keep = [];
  const orgs_to_ignore = [];
  const cfg = getConf(
    mockttp.url,
    InvalidRecordStrategy.SKIP,
    Edition.CLOUD,
    {},
    {workday: {orgs_to_keep, orgs_to_ignore}}
  );

  const ctx: StreamContext = new StreamContext(
    new AirbyteLogger(AirbyteLogLevel.WARN),
    cfg,
    {},
    'workday-test-graph-1',
    'workday-test-origin-1'
  );
  updateCustomReportWithFields(customReportDestination, k);
  return [customReportDestination, ctx];
}

function runCustomReportDestination(
  customReportDestination,
  ctx
): [ReadonlyArray<DestinationRecord>, Record<string, string>] {
  // HERE
  customReportDestination.setOrgsToKeepAndIgnore(ctx);
  return customReportDestination.generateFinalRecords(ctx);
}

describe('workday', () => {
  const logger = testLogger();
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/workday/catalog.json';
  const streamNamePrefix = 'mytestsource__workday__';
  const getTempConfig = async (
    orgs_to_keep,
    orgs_to_ignore
  ): Promise<string> => {
    return await tempConfig(
      mockttp.url,
      InvalidRecordStrategy.SKIP,
      Edition.CLOUD,
      {},
      {workday: {orgs_to_keep, orgs_to_ignore}}
    );
  };
  const runTest = async (
    configPath,
    processedByStream,
    writtenByModel,
    workdayStreamsLog
  ): Promise<void> => {
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
  test('check resulting org structure from "empty" input', () => {
    const [customReportDestination, ctx] = getCustomReportandCtxGivenKey(
      mockttp,
      'empty'
    );
    const [res, finalTeamToParent] = runCustomReportDestination(
      customReportDestination,
      ctx
    );
    expect(finalTeamToParent).toMatchSnapshot({all_teams: 'all_teams'});
    expect(JSON.stringify(res)).toMatch('[]');
  });
  test('check resulting org structure from "basic works" input', () => {
    const [customReportDestination, ctx] = getCustomReportandCtxGivenKey(
      mockttp,
      'basic works'
    );

    const [res, finalTeamToParent] = runCustomReportDestination(
      customReportDestination,
      ctx
    );

    expect(finalTeamToParent['all_teams']).toMatch('all_teams');
    expect(finalTeamToParent['A']).toMatch('all_teams');
    expect(finalTeamToParent['B']).toMatch('A');
    expect(res.length).toEqual(14);
  });
  test('check resulting org structure from "failing cycle 1" input', () => {
    const [customReportDestination, ctx] = getCustomReportandCtxGivenKey(
      mockttp,
      'failing cycle 1'
    );

    expect(() => {
      runCustomReportDestination(customReportDestination, ctx);
    }).toThrow();
  });
});
