import fs from 'fs';
import {Mockttp} from 'mockttp';
import pino from 'pino';
import tmp from 'tmp-promise';
import {Dictionary} from 'ts-essentials';
import util from 'util';

import {
  AirbyteConfig,
  AirbyteConfiguredCatalog,
  AirbyteMessageType,
  AirbyteRecord,
  AirbyteSourceBase,
  AirbyteState,
  AirbyteStateMessage,
} from 'faros-airbyte-cdk';
import {Data} from 'faros-airbyte-cdk/lib/utils';
import {Edition, InvalidRecordStrategy} from 'airbyte-faros-destination/lib/common/types';

const TEST_SOURCE_ID = 'mytestsource';

tmp.setGracefulCleanup();

/**
 * Read a test resource by name
 */
export function readTestResourceFile(fileName: string): string {
  return fs.readFileSync(`test/resources/${fileName}`, 'utf8');
}

const writeFile = util.promisify(fs.write);

/**
 * Parse a test resource into JSON
 */
export function readTestResourceAsJSON(fileName: string): any {
  return JSON.parse(readTestResourceFile(fileName));
}

/**
 * Creates a temporary file
 * @return path to the temporary file
 */
export async function tempFile(data: string, postfix: string): Promise<string> {
  const file = await tmp.file({postfix});
  await writeFile(file.fd, data, null, 'utf-8');
  return file.path;
}

export function readTestFile(fileName: string): string {
  return fs.readFileSync(`test_files/${fileName}`, 'utf8');
}

/**
 * Parse a test file into JSON
 */
export function readTestFileAsJSON(fileName: string): any {
  return JSON.parse(readTestFile(fileName));
}

export function readResourceFile(fileName: string): string {
  return fs.readFileSync(`resources/${fileName}`, 'utf8');
}

/**
 * Parse a resource into JSON
 */
export function readResourceAsJSON(fileName: string): any {
  return JSON.parse(readResourceFile(fileName));
}

export interface TempConfigOptions {
  readonly api_url: string;
  readonly invalid_record_strategy?: InvalidRecordStrategy;
  readonly edition?: Edition;
  readonly edition_configs?: Dictionary<any>;
  readonly source_specific_configs?: Dictionary<any>;
  readonly replace_origin_map?: Dictionary<any>;
  readonly exclude_fields_map?: Dictionary<any>;
  readonly log_records?: boolean;
}

/**
 * Creates a temporary file with testing configuration
 * @return path to the temporary config file to delete
 */
export async function tempConfig(options: TempConfigOptions): Promise<string> {
  const conf = getConf(options);

  return tempFile(JSON.stringify(conf), '.json');
}

export function getConf(options: TempConfigOptions): any {
  const {
    api_url,
    invalid_record_strategy = InvalidRecordStrategy.FAIL,
    edition = Edition.CLOUD,
    edition_configs = {},
    source_specific_configs = {},
    replace_origin_map = {},
    exclude_fields_map = {},
    log_records = false,
  } = options;

  const edition_configs_defaults =
    edition === Edition.CLOUD
      ? {
          edition,
          api_url,
          api_key: 'test-api-key',
          graph: 'test-graph',
        }
      : {
          edition,
          hasura_url: api_url,
          segment_user_id: 'bacaf6e6-41d8-4102-a3a4-5d28100e642f',
          segment_test_host: api_url,
        };

  const conf = {
    edition_configs: {...edition_configs_defaults, ...edition_configs},
    invalid_record_strategy,
    origin: 'test-origin',
    jsonata_destination_models: ['generic_Record'],
    jsonata_expression: `
    data.{
      "model": "generic_Record",
      "record": {
        "uid": foo
      }
    }`,
    source_specific_configs,
    replace_origin_map: JSON.stringify(replace_origin_map),
    exclude_fields_map: JSON.stringify(exclude_fields_map),
    faros_source_id: TEST_SOURCE_ID,
    log_records,
  };

  return conf;
}

export function sourceSpecificTempConfig(
  url: string,
  source_specific_configs: Dictionary<any>
): Promise<string> {
  return tempConfig({api_url: url, source_specific_configs});
}

export async function initMockttp(mockttp: Mockttp): Promise<void> {
  await mockttp.start({startPort: 30000, endPort: 50000});

  await mockttp
    .forGet('/users/me')
    .once()
    .thenReply(200, JSON.stringify({tenantId: '1'}));

  await mockttp
    .forGet('/graphs/test-graph/statistics')
    .once()
    .thenReply(200, JSON.stringify({}));

  await mockttp.forGet('/healthz').once().thenReply(200, JSON.stringify({}));

  await mockttp
    .forGet(`/accounts/${TEST_SOURCE_ID}`)
    .once()
    .thenReply(200, JSON.stringify({account: {accountId: TEST_SOURCE_ID}}));

  const mockSyncResult = {
    sync: {
      syncId: '1',
      logId: '1',
      startedAt: new Date().toISOString(),
      status: 'running',
    },
  };
  await mockttp
    .forPut(`/accounts/${TEST_SOURCE_ID}/syncs`)
    .once()
    .thenReply(200, JSON.stringify(mockSyncResult));

  await mockttp
    .forPatch(`/accounts/${TEST_SOURCE_ID}/syncs/1`)
    .once()
    .thenReply(200, JSON.stringify(mockSyncResult));
}

export function testLogger(name = 'test'): pino.Logger {
  return pino({
    name,
    level: process.env.LOG_LEVEL ?? 'info',
    transport:
      process.env.LOG_LEVEL?.toLowerCase() === 'debug'
        ? {target: 'pino-pretty', options: {levelFirst: true}}
        : undefined,
  });
}

export interface SourceCheckTestOptions {
  source: AirbyteSourceBase<AirbyteConfig>;
  configOrPath?: string | AirbyteConfig;
}

export const sourceCheckTest = async (
  options: SourceCheckTestOptions
): Promise<void> => {
  const {source, configOrPath} = options;
  const config = resolveInput(configOrPath);
  expect(await source.check(config)).toMatchSnapshot();
};

export interface SourceReadTestOptions {
  source: AirbyteSourceBase<AirbyteConfig>;
  configOrPath: string | AirbyteConfig;
  catalogOrPath: string | AirbyteConfiguredCatalog;
  stateOrPath?: string | AirbyteState;
  onBeforeReadResultConsumer?: (res: {
    config: AirbyteConfig;
    catalog: AirbyteConfiguredCatalog;
    state?: AirbyteState;
  }) => void;
  checkRecordsData?: (records: ReadonlyArray<Dictionary<any>>) => void;
  checkFinalState?: (state: Dictionary<any>) => void;
}

export const sourceReadTest = async (
  options: SourceReadTestOptions
): Promise<void> => {
  const {
    source,
    configOrPath,
    catalogOrPath,
    stateOrPath = undefined,
    onBeforeReadResultConsumer = undefined,
    checkRecordsData = undefined,
    checkFinalState = undefined,
  } = options;
  const config = resolveInput(configOrPath);
  const catalog = resolveInput(catalogOrPath);
  const state = stateOrPath ? resolveInput(stateOrPath) : {};
  const res = await source.onBeforeRead(config, catalog, state);
  if (onBeforeReadResultConsumer) {
    onBeforeReadResultConsumer(res);
  }
  const generator = source.read(res.config, res.config, res.catalog, res.state);
  const records: Dictionary<any>[] = [];
  let finalState: Dictionary<any>;
  for await (const message of generator) {
    if (message.type === AirbyteMessageType.RECORD) {
      records.push((message as AirbyteRecord).record.data);
    } else if (message.type === AirbyteMessageType.STATE) {
      finalState = (message as AirbyteStateMessage).state.data;
    }
  }
  if (checkRecordsData) {
    checkRecordsData(records);
  }
  if (checkFinalState) {
    checkFinalState(Data.decompress(finalState));
  }
};

export const sourceSchemaTest = (
  source: AirbyteSourceBase<AirbyteConfig>,
  config: AirbyteConfig
): void => {
  const streams = source.streams(config);

  const validateFieldInSchema = (
    field: string | string[],
    schema: Dictionary<any>
  ): void => {
    if (Array.isArray(field)) {
      let nestedField = schema;
      for (const subField of field) {
        expect(nestedField).toHaveProperty(subField);
        nestedField = nestedField[subField].properties;
      }
    } else {
      expect(schema).toHaveProperty(field);
    }
  };

  for (const stream of streams) {
    const jsonSchema = stream.getJsonSchema().properties;
    const primaryKey = stream.primaryKey;
    const cursorField = stream.cursorField;

    if (primaryKey) {
      if (Array.isArray(primaryKey)) {
        for (const key of primaryKey) {
          validateFieldInSchema(key, jsonSchema);
        }
      } else {
        validateFieldInSchema(primaryKey, jsonSchema);
      }
    }

    validateFieldInSchema(cursorField, jsonSchema);
  }
};

function resolveInput<T>(inputOrPath: string | T): T {
  return typeof inputOrPath === 'string'
    ? readTestResourceAsJSON(inputOrPath)
    : inputOrPath;
}

export const customStreamsTest = async (
  source: AirbyteSourceBase<AirbyteConfig>,
  config: AirbyteConfig,
  allStreams: ReadonlyArray<string>,
  selectedStreams?: ReadonlyArray<string>
): Promise<void> => {
  const {catalog} = await source.onBeforeRead(
    {...config, run_mode: 'Custom', custom_streams: selectedStreams},
    {streams: allStreams.map((name) => ({stream: {name}}))} as any
  );
  expect(catalog.streams).toHaveLength((selectedStreams ?? allStreams).length);
  expect(catalog.streams.map((s) => s.stream.name)).toEqual(
    expect.arrayContaining(selectedStreams ?? allStreams)
  );
};
