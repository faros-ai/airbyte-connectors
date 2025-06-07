import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';

export interface LaunchDarklyProject {
  key: string;
  name: string;
  description?: string;
  creationDate?: number;
  tags?: string[];
}

export interface LaunchDarklyEnvironment {
  key: string;
  name: string;
  color?: string;
  creationDate?: number;
  tags?: string[];
}

export interface LaunchDarklyVariation {
  _id?: string;
  value: string | number | boolean | object;
  name?: string;
  description?: string;
}

export interface LaunchDarklyFeatureFlag {
  key: string;
  name: string;
  kind: string;
  description?: string;
  archived?: boolean;
  creationDate?: number;
  variations?: LaunchDarklyVariation[];
  defaults?: {
    onVariation?: number;
    offVariation?: number;
  };
  environments?: Record<string, any>;
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
  creationDate?: number;
}

export abstract class LaunchDarklyConverter extends Converter {
  source = 'LaunchDarkly';

  id(record: AirbyteRecord): any {
    return record?.record?.data?.key || record?.record?.data?.id;
  }
}
