import {camelCase, upperFirst} from 'lodash';

export function upperCamelCase(str: string): string {
  return upperFirst(camelCase(str));
}

export function normalize(str: string): string {
  return str.replace(/\s/g, '').toLowerCase();
}

export function toDate(
  val: Date | string | number | undefined
): Date | undefined {
  if (typeof val === 'number') {
    return new Date(val);
  }
  if (!val) {
    return undefined;
  }
  return new Date(val);
}
