import {FarosClient, paginatedQueryV2} from 'faros-js-client';
import fs from 'fs';
import path from 'path';

const VCS_USER_TOOL_QUERY_BASE = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    '..',
    'resources',
    'common',
    'queries',
    'vcs-user-tool.gql'
  ),
  'utf8'
);

/**
 * Get the vcs_UserTool query with optional toolDetail parameter.
 * If toolDetail is not provided, it will be removed from the query entirely.
 */
export function getVcsUserToolQuery(includeToolDetail: boolean): string {
  if (includeToolDetail) {
    return VCS_USER_TOOL_QUERY_BASE;
  }
  // Remove toolDetail from query parameters and where clause
  return VCS_USER_TOOL_QUERY_BASE.replace(
    /\s*\$toolDetail: String!\n/g,
    ''
  ).replace(/\s*toolDetail: \{_eq: \$toolDetail\}\n/g, '');
}

export interface VcsUserToolQueryParams {
  source: string;
  organizationUid: string;
  toolCategory: string;
  toolDetail?: string | null;
  inactive: boolean;
}

/**
 * Helper method to query vcs_UserTool records from Faros.
 * Automatically handles the optional toolDetail parameter.
 */
export function queryVcsUserTools(
  farosClient: FarosClient,
  graph: string,
  params: VcsUserToolQueryParams
): AsyncIterable<any> {
  const includeToolDetail = params.toolDetail != null;
  const query = getVcsUserToolQuery(includeToolDetail);

  const queryParams = new Map<string, any>([
    ['source', params.source],
    ['organizationUid', params.organizationUid],
    ['toolCategory', params.toolCategory],
    ['inactive', params.inactive],
  ]);

  if (includeToolDetail) {
    queryParams.set('toolDetail', params.toolDetail);
  }

  return farosClient.nodeIterable(
    graph,
    query,
    100,
    paginatedQueryV2,
    queryParams
  );
}
