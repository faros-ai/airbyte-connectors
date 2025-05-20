import {
  readResourceFile,
  readResourceAsJSON,
  readTestResourceFile,
  readTestResourceAsJSON,
} from 'faros-airbyte-cdk';

export {
  readResourceAsJSON,
  readTestResourceAsJSON,
};

export function readTestResource(filename: string): any {
  return readTestResourceFile(filename, 'test/resources');
}
