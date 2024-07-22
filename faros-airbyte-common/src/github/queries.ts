import fs from 'fs-extra';
import path from 'path';

export const FILES_FRAGMENT = loadQuery('files-fragment.gql');

export const REVIEWS_FRAGMENT = loadQuery('reviews-fragment.gql');

const COMMIT_FIELDS_FRAGMENT = loadQuery('commit-fields-fragment.gql');

// GraphQL query used to get pull requests
export const PULL_REQUESTS_QUERY = loadQuery('pull-requests-query.gql');

// GraphQL query used to get labels
export const LABELS_QUERY = loadQuery('labels-query.gql');

// GraphQL query used to get organization members
export const ORG_MEMBERS_QUERY = loadQuery('list-members-query.gql');

// GraphQL query used to get commits from repository
export const COMMITS_QUERY =
  COMMIT_FIELDS_FRAGMENT + loadQuery('commits-query.gql');

// GraphQL query used to get commits from repository with changedFilesIfAvailable
export const COMMITS_CHANGED_FILES_IF_AVAILABLE_QUERY =
  COMMIT_FIELDS_FRAGMENT +
  loadQuery('commits-changed-files-if-available-query.gql');

// GraphQL query used to get commits from repository with changedFiles
export const COMMITS_CHANGED_FILES_QUERY =
  COMMIT_FIELDS_FRAGMENT + loadQuery('commits-changed-files-query.gql');

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
