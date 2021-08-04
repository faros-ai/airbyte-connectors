import fs from 'fs';
import path from 'path';

export const PACKAGE_ROOT = path.join(__dirname, '..');

const packageInfo = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')
);
export const PACKAGE_VERSION = packageInfo.version;
