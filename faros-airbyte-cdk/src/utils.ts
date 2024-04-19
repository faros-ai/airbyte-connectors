import fastRedact from 'fast-redact';
import fs from 'fs';
import traverse from 'json-schema-traverse';
import _, {cloneDeep} from 'lodash';
import path from 'path';

import {AirbyteConfig, AirbyteSpec} from './protocol';

export const PACKAGE_ROOT = path.join(__dirname, '..');

const packageInfo = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')
);

export const PACKAGE_VERSION = packageInfo.version;

export function pathsToRedact(spec: AirbyteSpec): string[] {
  const paths = [];
  traverse(spec.spec.connectionSpecification ?? {}, {
    cb: (schema, pointer) => {
      if (schema.airbyte_secret) {
        paths.push(toPath(pointer));
      }
    },
  });
  return paths;
}

/** Redact config of all secret values based on the provided specification */
export function redactConfig(
  config: AirbyteConfig,
  spec: AirbyteSpec
): AirbyteConfig {
  const redact = fastRedact({
    paths: pathsToRedact(spec),
    censor: 'REDACTED',
    serialize: false,
  });
  return redact(_.cloneDeep(config)) as AirbyteConfig;
}

export function redactConfigAsString(
  config: AirbyteConfig,
  spec: AirbyteSpec
): string {
  const redact = fastRedact({paths: pathsToRedact(spec), censor: 'REDACTED'});
  return `${redact(config)}`;
}

function toPath(pointer: string): string {
  return pointer
    .replace(/\/oneOf\/\d+/g, '')
    .replace(/\/items(\/?)/g, '[*]$1')
    .split('/properties/')
    .filter((s) => s)
    .join('.');
}

/**
 * Sets all undefined values with defaults from spec to their default value.
 * The changes are made on a copy of the input.
 * */
export function withDefaults<Config extends AirbyteConfig>(
  config: Config,
  spec: AirbyteSpec
): Config {
  const defaultsByPath = new Map<string, any>();
  traverse(spec.spec.connectionSpecification ?? {}, {
    cb: (schema, pointer) => {
      if (schema.default) {
        defaultsByPath.set(toPath(pointer), schema.default);
      }
    },
  });
  // create a copy of input and apply defaults
  const result = _.cloneDeep(config);
  for (const [path, defaultValue] of defaultsByPath) {
    if (_.get(result, path) === undefined) {
      _.set(result, path, defaultValue);
    }
  }
  return result;
}

/** Convert a value to Date */
export function toDate(
  val: Date | string | number | undefined
): Date | undefined {
  if (typeof val === 'number') {
    return new Date(val);
  }
  if (!val) {
    return undefined;
  }
  return new Date(val);
}

export function base64Encode(str: string): string {
  return Buffer.from(str, 'binary').toString('base64');
}

type Properties = {[propName: string]: SpecProperty};

interface SpecObject {
  title: string;
  type: string;
  required?: string[];
  properties: Properties;
}

interface SpecProperty {
  type: string;
  order?: number;
  const?: string;
  title?: string;
  description?: string;
  examples?: any[];
  items?: {type: string; title?: string; properties?: Properties};
  oneOf?: SpecObject[];
  properties?: Properties;
}

export function minimizeSpec(airbyteSpec: AirbyteSpec): AirbyteSpec {
  const spec = cloneDeep(airbyteSpec.spec);
  for (const prop of Object.values(
    spec.connectionSpecification?.properties ?? {}
  )) {
    minimizeSpecProperty(prop as SpecProperty);
  }
  return new AirbyteSpec(spec);
}

function minimizeSpecProperty(prop: SpecProperty): void {
  prop.title = undefined;
  prop.description = undefined;
  prop.examples = undefined;
  prop.order = undefined;
  for (const object of prop.oneOf ?? []) {
    minimizeSpecObject(object);
  }
  for (const item of Object.values(prop.items?.properties ?? {})) {
    minimizeSpecProperty(item);
  }
  for (const property of Object.values(prop.properties ?? {})) {
    minimizeSpecProperty(property);
  }
}

function minimizeSpecObject(config: SpecObject): void {
  for (const prop of Object.values(config.properties)) {
    minimizeSpecProperty(prop);
  }
}
