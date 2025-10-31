import {User} from './types';

/**
 * Gets a unique identifier for an Azure DevOps user.
 * Tries principalName first, then falls back to uniqueName.
 * This handles differences between Azure DevOps Cloud and Server.
 *
 * @param user - The Azure DevOps user object
 * @returns The user's unique identifier, or undefined if neither field exists
 */
export function getUserIdentifier(user: User): string | undefined {
  if ('principalName' in user && user.principalName) {
    return user.principalName;
  }
  if ('uniqueName' in user && user.uniqueName) {
    return user.uniqueName;
  }
  return undefined;
}
