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
  readonly edition_configs: Dictionary<any>;
  readonly dry_run?: boolean;
  readonly invalid_record_strategy?: InvalidRecordStrategy;
  readonly jsonata_destination_models?: ReadonlyArray<string>;
  readonly jsonata_expression?: string;
  readonly jsonata_mode?: JSONataApplyMode;
  readonly origin?: string;
  readonly accept_input_records_origin?: boolean;
  readonly replace_origin_map?: string;
  readonly exclude_fields_map?: string;
  readonly redact_fields_map?: string;
  readonly redact_custom_regex?: string;
  readonly source_specific_configs?: Dictionary<any>;
  readonly keep_alive?: boolean;
  readonly skip_source_success_check?: boolean;
  readonly faros_source_id?: string;
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
