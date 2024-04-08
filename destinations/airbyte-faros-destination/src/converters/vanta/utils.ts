import fs from 'fs-extra';
import path from 'path';

// Function to find a specific parent directory
function findParentDirectory(
  currentDir: string,
  targetDirName: string
): string | null {
  let currentPath = currentDir;
  while (currentPath !== '/') {
    if (path.basename(currentPath) === targetDirName) {
      return currentPath;
    }
    currentPath = path.dirname(currentPath);
  }
  return null;
}

export function getQueryFromName(name: string): string {
  const crt_dir = __dirname;
  // We go back to the part of dir which ends with 'vanta-source':
  const targetDirPath = findParentDirectory(
    crt_dir,
    'airbyte-faros-destination'
  );
  if (!targetDirPath) {
    throw new Error('airbyte-faros-destination directory not found');
  }

  const gql_dir = path.join(targetDirPath, 'resources');

  const fn = `${name}.gql`;
  // Check if fn is in gql_dir:
  if (!fs.existsSync(`${gql_dir}/${fn}`)) {
    throw new Error(`Query ${fn} not found in ${gql_dir}`);
  }
  // We access the directory resources/gql_queries to get the query
  return fs.readFileSync(`${gql_dir}/${fn}`, 'utf8');
}
