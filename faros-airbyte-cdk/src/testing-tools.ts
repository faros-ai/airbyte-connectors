import fs from 'fs';
import {Dictionary} from 'ts-essentials';

import {
  AirbyteConfig,
  AirbyteConfiguredCatalog,
  AirbyteMessageType,
  AirbyteRecord,
  AirbyteSourceBase,
  AirbyteState,
} from '.';

export function readTestResourceFile(fileName: string): string {
  return fs.readFileSync(`test/resources/${fileName}`, 'utf8');
}

/**
 * Parse a test resource into JSON
 */
export function readTestResourceAsJSON(fileName: string): any {
  return JSON.parse(readTestResourceFile(fileName));
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
  for await (const message of generator) {
    if (message.type === AirbyteMessageType.RECORD) {
      records.push((message as AirbyteRecord).record.data);
    }
  }
  if (checkRecordsData) {
    checkRecordsData(records);
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

    // Validate primaryKey is in jsonSchema
    if (primaryKey) {
      if (Array.isArray(primaryKey)) {
        for (const key of primaryKey) {
          validateFieldInSchema(key, jsonSchema);
        }
      } else {
        validateFieldInSchema(primaryKey, jsonSchema);
      }
    }

    // Validate cursorField is in jsonSchema
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
