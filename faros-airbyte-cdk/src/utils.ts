import fastRedact from 'fast-redact';
import fs from 'fs';
import path from 'path';

import {AirbyteConfig, AirbyteSpec} from './protocol';

export const PACKAGE_ROOT = path.join(__dirname, '..');

const packageInfo = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')
);

/** Redact config of all secret values based on the provided specification */
export function redactConfig(config: AirbyteConfig, spec: AirbyteSpec): string {
  const props = spec.spec.connectionSpecification?.properties ?? {};
  const paths = [];
  for (const prop of Object.keys(props)) {
    if (props[prop]?.airbyte_secret === true) {
      paths.push(prop);
    }
  }
  const redact = fastRedact({paths, censor: 'REDACTED'});
  return `${redact(config)}`;
}

export const PACKAGE_VERSION = packageInfo.version;
