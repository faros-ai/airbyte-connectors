import {Converter} from '../converter';

export const DEFAULT_ROOT_TEAM_ID = 'all_teams';

export abstract class FarosOrgImportConverter extends Converter {
  source = 'faros-org-import';
}

export function lift<T, R>(val: T | undefined, fn: (t: T) => R): R | undefined {
  return val ? fn(val) : undefined;
}
