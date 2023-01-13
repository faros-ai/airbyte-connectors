import fs from 'fs-extra';
import zlib from 'zlib';

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

export const legacyV1Schema = Buffer.from(
  zlib.gzipSync(
    `schema {
      query: Query
    }

    type Query {
      name(id: ID!): String
    }`
  )
).toString('base64');
