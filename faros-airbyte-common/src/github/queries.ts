import fs from 'fs-extra';
import path from 'path';

export const LABELS_FRAGMENT = loadQuery('labels-fragment.gql');

export const FILES_FRAGMENT = loadQuery('files-fragment.gql');

const REVIEW_FIELDS_FRAGMENT = loadQuery('review-fields-fragment.gql');

export const REVIEWS_FRAGMENT =
  REVIEW_FIELDS_FRAGMENT + loadQuery('reviews-fragment.gql');

const REVIEW_REQUEST_FIELDS_FRAGMENT = loadQuery(
  'review-request-fields-fragment.gql'
);

export const REVIEW_REQUESTS_FRAGMENT =
  REVIEW_REQUEST_FIELDS_FRAGMENT + loadQuery('review-requests-fragment.gql');

const COMMIT_FIELDS_FRAGMENT = loadQuery('commit-fields-fragment.gql');

const ASSIGNEE_FIELDS_FRAGMENT = loadQuery('assignee-fields-fragment.gql');

// GraphQL query used to get pull requests
export const PULL_REQUESTS_QUERY = loadQuery('pull-requests-query.gql');

export const PULL_REQUESTS_CURSOR_QUERY = loadQuery(
  'pull-requests-cursor-query.gql'
);

export const PULL_REQUEST_REVIEWS_QUERY =
  REVIEW_FIELDS_FRAGMENT + loadQuery('pull-request-reviews-query.gql');

export const PULL_REQUEST_REVIEW_REQUESTS_QUERY =
  REVIEW_REQUEST_FIELDS_FRAGMENT +
  loadQuery('pull-request-review-requests-query.gql');

// GraphQL query used to get labels
export const LABELS_QUERY = loadQuery('labels-query.gql');

// GraphQL query used to get organization members
export const ORG_MEMBERS_QUERY = loadQuery('list-members-query.gql');

// GraphQL query used to get SAML SSO users when SAML SSO is enabled on organization level
export const LIST_SAML_SSO_USERS_QUERY = loadQuery(
  'list-saml-sso-users-query.gql'
);

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

// Graphql query used to get tags by repository
export const REPOSITORY_TAGS_QUERY = loadQuery('repository-tags-query.gql');

// Graphql query used to get organization projects
export const PROJECTS_QUERY = loadQuery('projects-query.gql');

// Graphql query used to get repo issues
export const ISSUES_QUERY =
  ASSIGNEE_FIELDS_FRAGMENT + loadQuery('issues-query.gql');

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
