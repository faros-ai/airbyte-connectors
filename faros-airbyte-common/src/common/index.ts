// TODO: Try https://www.npmjs.com/package/diff
import {createHmac} from 'crypto';

export interface FileDiff {
  deletions: number;
  additions: number;
  from?: string;
  to?: string;
  deleted?: boolean;
  new?: boolean;
}

export function bucket(key: string, data: string, bucketTotal: number): number {
  const md5 = createHmac('md5', key);
  md5.update(data);
  const hex = md5.digest('hex').substring(0, 8);
  return (parseInt(hex, 16) % bucketTotal) + 1; // 1-index for readability
}
