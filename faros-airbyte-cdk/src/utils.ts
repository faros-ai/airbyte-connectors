import fastRedact from 'fast-redact';
import fs from 'fs';
import traverse from 'json-schema-traverse';
import _ from 'lodash';
import path from 'path';

import {AirbyteConfig, AirbyteSpec} from './protocol';

export const PACKAGE_ROOT = path.join(__dirname, '..');

const packageInfo = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')
);

export const PACKAGE_VERSION = packageInfo.version;

/** Redact config of all secret values based on the provided specification */
export function redactConfig(config: AirbyteConfig, spec: AirbyteSpec): string {
  const paths = [];
  traverse(spec.spec.connectionSpecification ?? {}, {
    cb: (schema, pointer) => {
      if (schema.airbyte_secret) {
        paths.push(
          pointer
            .replace(/\/oneOf\/\d+/g, '')
            .split('/properties/')
            .filter((s) => s)
            .join('.')
        );
      }
    },
  });
  const redact = fastRedact({paths, censor: 'REDACTED'});
  return `${redact(config)}`;
}

/** Sets all undefined values with defaults to default value. The changes are made in-place. */
export function withDefaults(
  config: AirbyteConfig,
  spec: AirbyteSpec
): AirbyteConfig {
  const defaultsByPath = new Map<string, any>();
  traverse(spec.spec.connectionSpecification ?? {}, {
    cb: (schema, pointer) => {
      if (schema.default) {
        const path = pointer
          .replace(/\/oneOf\/\d+/g, '')
          .split('/properties/')
          .filter((s) => s)
          .join('.');
        defaultsByPath.set(path, schema.default);
      }
    },
  });
  for (const [path, defaultValue] of defaultsByPath) {
    if (_.get(config, path) === undefined) {
      _.set(config, path, defaultValue);
    }
  }
  return config;
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
