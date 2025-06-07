import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';

export interface LaunchDarklyProject {
  key: string;
  name: string;
  tags?: string[];
}

export interface LaunchDarklyEnvironment {
  key: string;
  name: string;
  color?: string;
  tags?: string[];
}

export interface LaunchDarklyFeatureFlag {
  key: string;
  name: string;
  kind: string;
  description?: string;
  tags?: string[];
}

export interface LaunchDarklyUser {
  key: string;
  name?: string;
  email?: string;
  country?: string;
}

export interface LaunchDarklyExperiment {
  key: string;
  name: string;
  description?: string;
  hypothesis?: string;
}

export abstract class LaunchDarklyConverter extends Converter {
  source = 'LaunchDarkly';

  id(record: AirbyteRecord): any {
    return record?.record?.data?.key || record?.record?.data?.id;
  }
}
