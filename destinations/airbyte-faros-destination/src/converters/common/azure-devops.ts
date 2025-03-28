import {User} from 'faros-airbyte-common/azure-devops';

// TODO: Make it return OrgKey
export function getOrganizationFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/');

    if (parts.length < 2 || parts[1] === '') {
      return undefined;
    }

    return parts[1];
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
