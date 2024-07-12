import fs from 'fs-extra';
import path from 'path';

// GraphQL query used to get pull requests
export const PULL_REQUESTS_QUERY = loadQuery('pull-requests-query.gql');

// GraphQL query used to get organization members
export const ORG_MEMBERS_QUERY = loadQuery('list-members-query.gql');

// GraphQL query used to get commits from repository
export const COMMITS_QUERY =
  loadFragment('commit-fields.gql') + loadQuery('commits-query.gql');

// GraphQL query used to get commits from repository with changedFilesIfAvailable
export const COMMITS_CHANGED_FILES_IF_AVAILABLE_QUERY =
  loadFragment('commit-fields.gql') +
  loadQuery('commits-changed-files-if-available-query.gql');

// GraphQL query used to get commits from repository with changedFiles
export const COMMITS_CHANGED_FILES_QUERY =
  loadFragment('commit-fields.gql') +
  loadQuery('commits-changed-files-query.gql');

/**
 * Load query file from resources
 * @param query query file name
 * @returns query string
 */
function loadQuery(query: string): string {
  return fs.readFileSync(
    path.join(__dirname, '..', '..', 'resources', 'github', 'queries', query),
    'utf8'
  );
}

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
