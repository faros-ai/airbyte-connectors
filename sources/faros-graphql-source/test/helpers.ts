import fs from 'fs-extra';

export function readResourceAsJSON(filename: string): any {
  return JSON.parse(fs.readFileSync(`resources/${filename}`, 'utf8'));
}

export function readTestResource(filename: string): any {
  return fs.readFileSync(`test/resources/${filename}`, 'utf8');
}

export function readTestResourceAsJSON(filename: string): any {
  return JSON.parse(readTestResource(filename));
}

export const entrySchema = readTestResourceAsJSON('keys.avsc').schema;
