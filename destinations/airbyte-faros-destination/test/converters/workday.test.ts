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
    readTestResourceFile('workday/test_fields_inputs.json')
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
  fail_on_cycles: boolean = false,
  team_to_parent_list: string[] = []
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
      workday: {
        orgs_to_keep,
        orgs_to_ignore,
        fail_on_cycles,
        team_to_parent_list,
      },
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

async function runCustomReportDestination(
  customReportDestination,
  ctx
): Promise<[ReadonlyArray<DestinationRecord>, Record<string, string>]> {
  customReportDestination.setOrgsToKeepAndIgnore(ctx);
  return await customReportDestination.generateFinalRecords(ctx);
}

describe('workday', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const getTempConfig = async (
    orgs_to_keep,
    orgs_to_ignore,
    keep_terminated_employees = false,
    resolve_locations = false,
    log_records = false,
    additional_team_info: Record<string, Record<string, string>> = {}
  ): Promise<string> => {
    return await tempConfig({
      api_url: mockttp.url,
      invalid_record_strategy: InvalidRecordStrategy.SKIP,
      edition: Edition.CLOUD,
      edition_configs: {},
      source_specific_configs: {
        workday: {
          orgs_to_keep,
          orgs_to_ignore,
          keep_terminated_employees,
          resolve_locations,
          team_id_to_parent_id: JSON.stringify(
            additional_team_info.team_id_to_parent_id
          ),
          team_id_to_name: JSON.stringify(
            additional_team_info?.team_id_to_name
          ),
        },
      },
      log_records,
    });
  };

  beforeEach(async () => {
    await initMockttp(mockttp);
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from customreports v1 stream accept all', async () => {
    const keep_terminated_employees = false;
    const resolve_locations = false;
    const log_records = true;
    const configPath = await getTempConfig(
      ['A', 'B'],
      [],
      keep_terminated_employees,
      resolve_locations,
      log_records
    );

    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/workday/catalog.json',
      inputRecordsPath: 'workday/stream_v1.log',
      checkRecordsData: (records) => expect(records).toMatchSnapshot(),
    });
  });

  test('process records from customreports v1 stream accept all - geocoded', async () => {
    const keep_terminated_employees = false;
    const resolve_locations = true;
    const log_records = true;

    const geocodeLookupResults = JSON.parse(
      readTestResourceFile('workday/geocode_lookup.json')
    );

    await mockttp
      .forPost('/geocoding/lookup')
      .thenReply(200, JSON.stringify({locations: [geocodeLookupResults[0]]}));

    await mockttp
      .forPost('/geocoding/lookup')
      .thenReply(200, JSON.stringify({locations: [geocodeLookupResults[1]]}));

    const configPath = await getTempConfig(
      ['A', 'B'],
      [],
      keep_terminated_employees,
      resolve_locations,
      log_records
    );

    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/workday/catalog.json',
      inputRecordsPath: 'workday/stream_v1.log',
      checkRecordsData: (records) => expect(records).toMatchSnapshot(),
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

  test('process randomly generated records from many records stream', async () => {
    const configPath = await getTempConfig([], []);
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/workday/catalog.json',
      inputRecordsPath: 'workday/stream_many_records_per_employee.log',
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

  test('Combine input team parent arrays with the rest v7 stream', async () => {
    const configPath = await getTempConfig([], [], false, false, false, {
      team_id_to_parent_id: {
        A: 'B',
        B: 'D',
        C: 'D',
      },
    });
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/workday/catalog.json',
      inputRecordsPath: 'workday/stream_v7.log',
    });
  });

  test('Combine input team parent arrays with the rest v7 stream with id to name', async () => {
    const configPath = await getTempConfig([], [], false, false, false, {
      team_id_to_parent_id: {
        a: 'b',
        b: 'd',
        c: 'd',
      },
      team_id_to_name: {
        a: 'A',
        b: 'B',
        c: 'C',
        d: 'D',
      },
    });
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/workday/catalog.json',
      inputRecordsPath: 'workday/stream_v7.log',
    });
  });

  test('check resulting org structure from "empty" input', async () => {
    const [customReportDestination, ctx] = getCustomReportandCtxGivenKey(
      mockttp,
      'empty'
    );
    const [res, finalTeamToParent] = await runCustomReportDestination(
      customReportDestination,
      ctx
    );
    expect(finalTeamToParent).toMatchSnapshot({});
    expect(JSON.stringify(res)).toMatch('[]');
  });

  test('check resulting org structure from "basic works" input', async () => {
    const [customReportDestination, ctx] = getCustomReportandCtxGivenKey(
      mockttp,
      'basic works'
    );

    const [res, finalTeamToParent] = await runCustomReportDestination(
      customReportDestination,
      ctx
    );

    expect(finalTeamToParent['A']).toMatch('all_teams');
    expect(finalTeamToParent['B']).toMatch('A');
    expect(res.length).toEqual(12);
  });

  test('check resulting org structure from "failing cycle 1" input', async () => {
    const fail_on_cycles = true;
    const [customReportDestination, ctx] = getCustomReportandCtxGivenKey(
      mockttp,
      'failing cycle 1',
      fail_on_cycles
    );

    await expect(
      runCustomReportDestination(customReportDestination, ctx)
    ).rejects.toThrow();
  });

  test('check resulting org structure from "failing cycle 1" ignore fail input', async () => {
    const [customReportDestination, ctx] = getCustomReportandCtxGivenKey(
      mockttp,
      'failing cycle 1'
    );

    //We expect it to not throw errors
    await expect(
      runCustomReportDestination(customReportDestination, ctx)
    ).resolves.toBeDefined();
  });
});
