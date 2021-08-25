import fs from 'fs-extra';

export function readTestResourceFile(fileName: string): string {
  return fs.readFileSync(`test/resources/${fileName}`, 'utf8');
}

export const githubLog = readTestResourceFile('github.log');
export const githubPGRawLog = readTestResourceFile('github-pg-raw.log');
