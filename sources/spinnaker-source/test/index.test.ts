import fs from 'fs-extra';

import * as sut from '../src/index';

function readTestResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
}

describe('index', () => {
  // TODO: add tests
});
