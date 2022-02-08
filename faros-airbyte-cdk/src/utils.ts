import fastRedact from 'fast-redact';
import fs from 'fs';
import traverse from 'json-schema-traverse';
import path from 'path';

import {AirbyteConfig, AirbyteSpec} from './protocol';

export const PACKAGE_ROOT = path.join(__dirname, '..');

const packageInfo = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')
);

export const PACKAGE_VERSION = packageInfo.version;

/** Redact config of all secret values based on the provided specification */
export function redactConfig(config: AirbyteConfig, spec: AirbyteSpec): string {
  const props = spec.spec.connectionSpecification?.properties ?? {};
  const paths = [];
  traverse(spec.spec.connectionSpecification ?? {}, {
    cb: (schema, pointer) => {
      if (schema.airbyte_secret) {
        paths.push(
          pointer
            .replace(/\/oneOf\/d\+/g, '')
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
