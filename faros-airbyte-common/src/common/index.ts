// TODO: Try https://www.npmjs.com/package/diff
export interface FileDiff {
  deletions: number;
  additions: number;
  from?: string;
  to?: string;
  deleted?: boolean;
  new?: boolean;
}
