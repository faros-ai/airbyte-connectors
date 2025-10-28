import fs from 'fs';
import path from 'path';

/**
 * GraphQL query to fetch vcs_UserTool records from Faros.
 * Can be used to query for active/inactive user tools by source, organization, and tool category.
 * The toolDetail parameter is optional and can be omitted if not needed.
 */
export const VCS_USER_TOOL_QUERY = fs.readFileSync(
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
