import {AirbyteConfig} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {JSONataApplyMode} from '../converters/jsonata';

export enum Edition {
  COMMUNITY = 'community',
  CLOUD = 'cloud',
}

export enum InvalidRecordStrategy {
  FAIL = 'FAIL',
  SKIP = 'SKIP',
}

export interface DestinationConfig extends AirbyteConfig {
  edition_configs: Dictionary<any>;
  dry_run?: boolean;
  invalid_record_strategy?: InvalidRecordStrategy;
  jsonata_destination_models?: ReadonlyArray<string>;
  jsonata_expression?: string;
  jsonata_mode?: JSONataApplyMode;
  origin?: string;
  source_specific_configs?: Dictionary<any>;
}

export enum Operation {
  UPSERT = 'Upsert',
  UPDATE = 'Update',
  DELETION = 'Deletion',
}

export interface TimestampedRecord {
  model: string;
  origin: string;
  at: number;
  operation: Operation;
}

export interface UpsertRecord extends TimestampedRecord {
  operation: Operation.UPSERT;
  data: Dictionary<any>;
}

export interface UpdateRecord extends TimestampedRecord {
  operation: Operation.UPDATE;
  where: Dictionary<any>;
  mask: string[];
  patch: Dictionary<any>;
}

export interface DeletionRecord extends TimestampedRecord {
  operation: Operation.DELETION;
  where: Dictionary<any>;
}
