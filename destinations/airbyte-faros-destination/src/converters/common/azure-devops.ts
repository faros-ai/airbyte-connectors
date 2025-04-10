import {User} from 'faros-airbyte-common/azure-devops';

export function getOrganizationFromUrl(
  url: string,
  lookBack: 1 | 2 = 2
): string | undefined {
  try {
    const {hostname, pathNameParts} = parseUrl(url);

    // Azure DevOps Services (Cloud) URLs are like:
    // https://dev.azure.com/{organization}/{project}/_apis/entityPath
    if (['dev.azure.com', 'vssps.dev.azure.com'].includes(hostname)) {
      return pathNameParts[0];
    }

    // Azure DevOps Server URLs like:
    // https://{instance}/{organization}/{project}/_apis/entityPath
    const apisIndex = pathNameParts.indexOf('_apis');
    if (apisIndex >= 1) {
      return pathNameParts[apisIndex - lookBack];
    }

    return undefined;
  } catch (error) {
    return undefined;
  }
}

// Currently only validated to get the project name from a Build's git repository webUrl
export function getVcsOrgProjectFromUrl(url: string):
  | {
      orgName: string;
      projectName: string;
    }
  | undefined {
  try {
    const {hostname, pathNameParts} = parseUrl(url);

    // Azure DevOps Services (Cloud) URLs are like:
    // https://dev.azure.com/{organization}/{project}/_apis/entityPath
    if (['dev.azure.com', 'vssps.dev.azure.com'].includes(hostname)) {
      return {
        orgName: pathNameParts[0],
        projectName: pathNameParts[1],
      };
    }

    // Azure DevOps Server URLs for webUrl
    // https://{instance}/{organization}/{project}/_git/{entityPath}
    const gitIndex = pathNameParts.indexOf('_git');
    if (gitIndex > 1) {
      return {
        orgName: pathNameParts[gitIndex - 2],
        projectName: pathNameParts[gitIndex - 1],
      };
    }

    return undefined;
  } catch (error) {
    return undefined;
  }
}

// Support both principalName and uniqueName for AzureDevOps Server
export function getUniqueName(userItem: User): string | undefined {
  if ('principalName' in userItem && Boolean(userItem.principalName)) {
    return userItem.principalName;
  }
  if ('uniqueName' in userItem && Boolean(userItem.uniqueName)) {
    return userItem.uniqueName;
  }
  return undefined;
}

// Parse a URL, split on '/' and filter out empty segments
function parseUrl(url: string): {
  hostname: string;
  pathNameParts: ReadonlyArray<string>;
} {
  const parsed = new URL(url);
  return {
    hostname: parsed.hostname,
    pathNameParts: parsed.pathname.split('/').filter(Boolean),
  };
}
