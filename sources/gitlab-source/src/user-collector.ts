import {AirbyteLogger} from 'faros-airbyte-cdk';
import {FarosUserOutput} from 'faros-airbyte-common/gitlab';
import {pick} from 'lodash';

export type GitLabUserResponse = Partial<FarosUserOutput> & {
  public_email?: string;
  publicEmail?: string;
  webUrl?: string;
};

export class UserCollector {
  private readonly collectedUsers = new Map<string, GitLabUserResponse>();
  private readonly userNameMappings = new Map<string, Set<string>>();

  constructor(private readonly logger: AirbyteLogger) {}

  /**
   * Collect a user from any GitLab entity (member, commit author, etc.)
   * Handles deduplication and merging of user data
   */
  collectUser(user?: GitLabUserResponse, groupId?: string): void {
    if (!user?.username) {
      this.logger.debug(
        `User has no username. Skipping collection. ${JSON.stringify(user)}`
      );
      return;
    }

    // Check if user already exists
    const existingUser = this.collectedUsers.get(user.username);
    if (existingUser) {
      // Merge user data if new data has additional fields
      const mergedUser = this.mergeUsers(existingUser, user);
      this.collectedUsers.set(user.username, {
        ...mergedUser,
        group_ids: groupId
          ? [...existingUser.group_ids, groupId]
          : existingUser.group_ids,
      });
    } else {
      this.collectedUsers.set(user.username, {
        ...user,
        group_ids: groupId ? [groupId] : [],
      });
    }

    // Update name mappings if user has a name
    if (user.name) {
      if (!this.userNameMappings.has(user.name)) {
        this.userNameMappings.set(user.name, new Set<string>());
      }
      this.userNameMappings.get(user.name)?.add(user.username);
    }
  }

  /**
   * Get a commit author based on name mapping
   * Returns null if no unique mapping exists
   */
  getCommitAuthor(authorName: string, commitId: string): string | null {
    const usernames = this.userNameMappings.get(authorName);
    if (!usernames || usernames.size === 0) {
      this.logger.debug(
        `Failed to find a username for commit author "${authorName}" (commit: ${commitId})`
      );
      return null;
    }

    if (usernames.size > 1) {
      this.logger.debug(
        `Commit ${commitId} author name "${authorName}" maps to multiple usernames: ${[
          ...usernames,
        ].join(', ')}. Will skip author association.`
      );
      return null;
    }

    return [...usernames][0];
  }

  /**
   * Get all collected users
   */
  getCollectedUsers(): ReadonlyMap<string, FarosUserOutput> {
    return new Map(
      Array.from(this.collectedUsers.entries()).map(([username, user]) => [
        username,
        UserCollector.toOutput(user),
      ])
    );
  }

  /**
   * Get the count of collected users
   */
  getUserCount(): number {
    return this.collectedUsers.size;
  }

  /**
   * Check if a user has been collected
   */
  hasUser(username: string): boolean {
    return this.collectedUsers.has(username);
  }

  /**
   * Get a specific user by username
   */
  getUser(username: string): FarosUserOutput | undefined {
    const user = this.collectedUsers.get(username);
    return user ? UserCollector.toOutput(user) : undefined;
  }

  /**
   * Clear all collected data
   */
  clear(): void {
    this.collectedUsers.clear();
    this.userNameMappings.clear();
  }

  // Private helper methods
  private mergeUsers(
    existing: GitLabUserResponse,
    newUser: GitLabUserResponse
  ): GitLabUserResponse {
    // Use logic similar to getFinalUser in destinations/airbyte-faros-destination
    const finalUser: Partial<GitLabUserResponse> = {};
    for (const user of [existing, newUser]) {
      for (const key in user) {
        if (!finalUser[key] && user[key]) {
          finalUser[key] = user[key];
        }
      }
    }
    return finalUser;
  }

  static toOutput(user: GitLabUserResponse): FarosUserOutput {
    return {
      __brand: 'FarosUser' as const,
      ...pick(user, ['name', 'state']),
      username: user.username,
      email: user.email ?? user.public_email ?? user.publicEmail ?? null,
      web_url: user.web_url ?? user.webUrl ?? null,
      group_ids: [...new Set(user.group_ids)],
    };
  }
}
