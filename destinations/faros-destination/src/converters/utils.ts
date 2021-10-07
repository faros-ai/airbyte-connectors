import {camelCase, upperFirst} from 'lodash';

export function upperCamelCase(str: string): string {
  return upperFirst(camelCase(str));
}

export function normalize(str: string): string {
  return str.replace(/\s/g, '').toLowerCase();
}
