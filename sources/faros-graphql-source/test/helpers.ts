import fs from 'fs-extra';

export function readResource(filename: string): any {
  return JSON.parse(fs.readFileSync(`resources/${filename}`, 'utf8'));
}

export function readTestResource(filename: string): any {
  return JSON.parse(fs.readFileSync(`test/resources/${filename}`, 'utf8'));
}

export const entrySchema = readTestResource('keys.avsc').schema;
