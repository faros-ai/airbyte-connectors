import fs from 'fs-extra';

export function getQueryFromName(name: string): string {
  const gql_dir = `resources`;
  const fn = `${name}.gql`;
  // Check if fn is in gql_dir:
  if (!fs.existsSync(`${gql_dir}/${fn}`)) {
    throw new Error(`Query ${fn} not found in ${gql_dir}`);
  }
  // We access the directory resources/gql_queries to get the query
  return fs.readFileSync(`${gql_dir}/${fn}`, 'utf8');
}
