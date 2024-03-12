import fs from 'fs';
import {Mockttp} from 'mockttp';
import pino from 'pino';
import tmp from 'tmp-promise';
import {Dictionary} from 'ts-essentials';
import util from 'util';

import {Edition, InvalidRecordStrategy} from '../src';

const TEST_SOURCE_ID = 'mytestsource';

// Remove all controlled temporary objects on process exit
tmp.setGracefulCleanup();

/**
 * Read a test resource by name
 */
export function readTestResourceFile(fileName: string): string {
  return fs.readFileSync(`test/resources/${fileName}`, 'utf8');
}

const writeFile = util.promisify(fs.write);

/**
 * Creates a temporary file
 * @return path to the temporary file
 */
export async function tempFile(data: string, postfix: string): Promise<string> {
  const file = await tmp.file({postfix});
  await writeFile(file.fd, data, null, 'utf-8');
  return file.path;
}

/**
 * Creates a temporary file with testing configuration
 * @return path to the temporary config file to delete
 */
export async function tempConfig(
  url: string,
  invalid_record_strategy: InvalidRecordStrategy = InvalidRecordStrategy.SKIP,
  edition = Edition.CLOUD,
  edition_configs?: Dictionary<any>,
  source_specific_configs?: Dictionary<any>,
  replace_origin_map?: Dictionary<any>,
  exclude_fields_map?: Dictionary<any>
): Promise<string> {
  const conf = getConf(
    url,
    invalid_record_strategy,
    edition,
    edition_configs,
    source_specific_configs,
    replace_origin_map,
    exclude_fields_map
  );

  return tempFile(JSON.stringify(conf), '.json');
}

export function getConf(
  url: string,
  invalid_record_strategy: InvalidRecordStrategy = InvalidRecordStrategy.SKIP,
  edition = Edition.CLOUD,
  edition_configs?: Dictionary<any>,
  source_specific_configs?: Dictionary<any>,
  replace_origin_map?: Dictionary<any>,
  exclude_fields_map?: Dictionary<any>
): any {
  const edition_configs_defaults =
    edition === Edition.CLOUD
      ? {
          edition,
          api_url: url,
          api_key: 'test-api-key',
          graph: 'test-graph',
          graphql_api: 'v1',
        }
      : {
          edition,
          hasura_url: url,
          segment_user_id: 'bacaf6e6-41d8-4102-a3a4-5d28100e642f',
          segment_test_host: url,
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
  };
  return conf;
}

export function sourceSpecificTempConfig(
  url: string,
  source_specific_configs: Dictionary<any>
): Promise<string> {
  return tempConfig(
    url,
    InvalidRecordStrategy.SKIP,
    Edition.CLOUD,
    {},
    source_specific_configs
  );
}

export async function initMockttp(mockttp: Mockttp): Promise<void> {
  await mockttp.start({startPort: 30000, endPort: 50000});

  // Faros GraphQL auth check
  await mockttp
    .forGet('/users/me')
    .once()
    .thenReply(200, JSON.stringify({tenantId: '1'}));

  // Faros GraphQL graph stats
  await mockttp
    .forGet('/graphs/test-graph/statistics')
    .once()
    .thenReply(200, JSON.stringify({}));

  // Hasura health check
  await mockttp.forGet('/healthz').once().thenReply(200, JSON.stringify({}));

  // Get Faros Account
  await mockttp
    .forGet(`/accounts/${TEST_SOURCE_ID}`)
    .once()
    .thenReply(200, JSON.stringify({account: {accountId: TEST_SOURCE_ID}}));

  // Faros Account Sync
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
    // pino-pretty leaves threads open which can prevent Jest from exiting properly
    transport:
      process.env.LOG_LEVEL?.toLowerCase() === 'debug'
        ? {target: 'pino-pretty', options: {levelFirst: true}}
        : undefined,
  });
}
