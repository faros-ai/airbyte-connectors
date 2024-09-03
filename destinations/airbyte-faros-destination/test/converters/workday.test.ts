import {AirbyteLogger, AirbyteLogLevel} from 'faros-airbyte-cdk';
import {getLocal, Mockttp} from 'mockttp';

import {
  DestinationRecord,
  Edition,
  InvalidRecordStrategy,
  StreamContext,
} from '../../src';
import {Customreports} from '../../src/converters/workday/customreports';
import {
  getConf,
  initMockttp,
  readTestResourceFile,
  tempConfig,
} from '../testing-tools';
import {destinationWriteTest} from './utils';

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
    'employeeIDToRecords',
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
  k: string,
  fail_on_cycles: boolean = false
): [Customreports, StreamContext] {
  const customReportDestination = new Customreports();
  const orgs_to_keep = [];
  const orgs_to_ignore = [];
  const cfg = getConf({
    api_url: mockttp.url,
    invalid_record_strategy: InvalidRecordStrategy.SKIP,
    edition: Edition.CLOUD,
    edition_configs: {},
    source_specific_configs: {
      workday: {orgs_to_keep, orgs_to_ignore, fail_on_cycles},
    },
  });

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
  customReportDestination.setOrgsToKeepAndIgnore(ctx);
  return customReportDestination.generateFinalRecords(ctx);
}

describe('workday', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const getTempConfig = async (
    orgs_to_keep,
    orgs_to_ignore,
    keep_terminated_employees = false
  ): Promise<string> => {
    return await tempConfig({
      api_url: mockttp.url,
      invalid_record_strategy: InvalidRecordStrategy.SKIP,
      edition: Edition.CLOUD,
      edition_configs: {},
      source_specific_configs: {
        workday: {orgs_to_keep, orgs_to_ignore, keep_terminated_employees},
      },
    });
  };

  beforeEach(async () => {
    await initMockttp(mockttp);
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from customreports v1 stream accept all', async () => {
    const configPath = await getTempConfig(['A', 'B'], []);
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/workday/catalog.json',
      inputRecordsPath: 'workday/stream_v1.log',
    });
  });

  test('process records from customreports v1 stream reject all', async () => {
    const configPath = await getTempConfig([], ['A', 'B']);
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/workday/catalog.json',
      inputRecordsPath: 'workday/stream_v1.log',
    });
  });

  test('process randomly generated records from customreports v3 stream', async () => {
    const configPath = await getTempConfig([], []);
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/workday/catalog.json',
      inputRecordsPath: 'workday/stream_v3.log',
    });
  });
  test('Randomly generated records from customreports v4 stream with Terminated', async () => {
    const configPath = await getTempConfig([], [], true);
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/workday/catalog.json',
      inputRecordsPath: 'workday/stream_v4.log',
    });
  });
  test('process structured generated records from customreports v4 stream', async () => {
    const configPath = await getTempConfig([], []);
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/workday/catalog.json',
      inputRecordsPath: 'workday/stream_v4.log',
    });
  });
  test('Saved and Ignored structured generated records v4 stream', async () => {
    // Teams are:
    const configPath = await getTempConfig(
      ['TopDog', 'Engineering', 'Security'],
      ['ChiefExecs']
    );
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/workday/catalog.json',
      inputRecordsPath: 'workday/stream_v4.log',
    });
  });

  test('Saved and Ignored structured generated records v4 stream', async () => {
    // Teams are:
    const configPath = await getTempConfig(
      ['TopDog', 'Engineering', 'Security'],
      ['ChiefExecs']
    );
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/workday/catalog.json',
      inputRecordsPath: 'workday/stream_v4.log',
    });
  });
  test('Ignore improperly formatted records from customreports v6 stream', async () => {
    const configPath = await getTempConfig([], []);
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/workday/catalog.json',
      inputRecordsPath: 'workday/stream_v6.log',
    });
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
    console.log(finalTeamToParent);
    expect(finalTeamToParent['B']).toMatch('A');
    expect(res.length).toEqual(14);
  });
  test('check resulting org structure from "failing cycle 1" input', () => {
    const fail_on_cycles = true;
    const [customReportDestination, ctx] = getCustomReportandCtxGivenKey(
      mockttp,
      'failing cycle 1',
      fail_on_cycles
    );

    expect(() => {
      runCustomReportDestination(customReportDestination, ctx);
    }).toThrow();
  });
  test('check resulting org structure from "failing cycle 1" ignore fail input', () => {
    const [customReportDestination, ctx] = getCustomReportandCtxGivenKey(
      mockttp,
      'failing cycle 1'
    );

    //We expect it to not throw errors
    expect(() => {
      runCustomReportDestination(customReportDestination, ctx);
    }).not.toThrow();
  });
});
