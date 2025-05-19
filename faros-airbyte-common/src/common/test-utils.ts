import fs from 'fs';
import { readTestResourceFile, readTestResourceAsJSON } from 'faros-airbyte-cdk';

/**
 * Read a resource file from the specified path.
 * This function is compatible with the previous duplicated implementations
 * and maintains backward compatibility with resources in the 'resources/' directory.
 */
export function readResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
}

/**
 * Parse a test resource from the 'test/resources/' directory
 * This is simply re-exporting the CDK function for convenience.
 */
export const readTestResource = readTestResourceFile;

/**
 * Parse a test resource into JSON from the 'test/resources/' directory
 * This is simply re-exporting the CDK function for convenience.
 */
export const readTestResourceJSON = readTestResourceAsJSON;
