import {User} from 'faros-airbyte-common/azure-devops';
import {StreamContext} from '../converter';

export function getOrganization(
  url: string,
  ctx?: StreamContext,
  userEntity = false
): string | undefined {
  // Attempt to use the organization from the source config if available
  const sourceOrg = ctx?.getSourceConfig()?.organization;
  if (sourceOrg && url.includes(sourceOrg)) {
    return sourceOrg;
  }

  try {
    const parsed = new URL(url);

    // Handle Azure DevOps Services (Cloud) URLs
    if (['dev.azure.com', 'vssps.dev.azure.com'].includes(parsed.hostname)) {
      const parts = parsed.pathname.split('/');
      return parts[1];
    }

    // Handle Azure DevOps Server URLs like:
    // https://{instance}/{collection}/{project}/_apis/git/repositories/{repositoryId}
    const parts = parsed.pathname.split('/');
    // Remove empty segments
    const nonEmptyParts = parts.filter(Boolean);

    // Collection segment based on the entity type
    const apisIndex = nonEmptyParts.indexOf('_apis');
    if (apisIndex > 1) {
      const lookBack = userEntity ? 1 : 2;
      return nonEmptyParts[apisIndex - lookBack];
    }

    return undefined;
  } catch (error) {
    return undefined;
  }
}

export function getProjectFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/');

    if (parts.length < 3 || parts[2] === '') {
      return undefined;
    }

    return parts[2];
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
