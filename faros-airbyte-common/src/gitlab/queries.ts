import fs from 'fs-extra';
import path from 'path';

// GraphQL query used to get merge requests with notes
export const MERGE_REQUESTS_QUERY = loadQuery('merge-requests-query.gql');

/**
 * Load query file from resources
 * @param query query file name
 * @returns query string
 */
function loadQuery(query: string): string {
  return fs.readFileSync(
    path.join(__dirname, '..', '..', 'resources', 'gitlab', 'queries', query),
    'utf8'
  );
}
