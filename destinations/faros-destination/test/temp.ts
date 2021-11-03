import fs from 'fs';
import {AffixOptions, open, track} from 'temp';
import {Dictionary} from 'ts-essentials';

import {InvalidRecordStrategy} from '../src';

// Automatically track and cleanup temp files at exit
// TODO: this does not seem to work - figure out what's wrong
track();

/**
 * Creates a temporary file
 * @return path to the temporary file
 */
export async function tempFile(
  data: string,
  opts?: AffixOptions
): Promise<string> {
  const file = await open(opts);
  fs.writeSync(file.fd, data, null, 'utf-8');
  return file.path;
}

/**
 * Creates a temporary file with testing configuration
 * @return path to the temporary config file
 */
export async function tempConfig(
  api_url: string,
  invalid_record_strategy: InvalidRecordStrategy = InvalidRecordStrategy.SKIP,
  source_specific_configs?: Dictionary<any>
): Promise<string> {
  const conf = {
    api_url,
    invalid_record_strategy,
    api_key: 'test-api-key',
    graph: 'test-graph',
    origin: 'test-origin',
    jsonata_destination_models: ['vcs_User'],
    jsonata_expression: `
    data.{
      "model": "vcs_User",
      "record": {
        "uid": foo
      }
    }`,
    source_specific_configs,
  };
  return tempFile(JSON.stringify(conf), {suffix: '.json'});
}
