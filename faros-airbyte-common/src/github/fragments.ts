import fs from 'fs-extra';
import path from 'path';

export const FILES_FRAGMENT = loadFragment('files.gql');

export const COMMIT_FIELDS_FRAGMENT = loadFragment('commit-fields.gql');

function loadFragment(fragment: string): string {
  return fs.readFileSync(
    path.join(
      __dirname,
      '..',
      '..',
      'resources',
      'github',
      'fragments',
      fragment
    ),
    'utf8'
  );
}
