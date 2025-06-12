import {AirbyteLogger} from 'faros-airbyte-cdk';
import {User} from 'faros-airbyte-common/gitlab';

export class UserCollector {
  private readonly collectedUsers = new Map<string, User>();
  private readonly userNameMappings = new Map<string, Set<string>>();

  constructor(private readonly logger: AirbyteLogger) {}

  /**
   * Collect a user from any GitLab entity (member, commit author, etc.)
   * Handles deduplication and merging of user data
   */
  collectUser(user: User): void {
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
      this.collectedUsers.set(user.username, mergedUser);
    } else {
      this.collectedUsers.set(user.username, user);
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
   * Returns undefined if no unique mapping exists
   */
  getCommitAuthor(authorName: string, commitId: string): string | undefined {
    const usernames = this.userNameMappings.get(authorName);
    if (!usernames || usernames.size === 0) {
      this.logger.debug(
        `Failed to find a username for commit author "${authorName}" (commit: ${commitId})`
      );
      return undefined;
    }

    if (usernames.size > 1) {
      this.logger.debug(
        `Commit ${commitId} author name "${authorName}" maps to multiple usernames: ${[
          ...usernames,
        ].join(', ')}. Will skip author association.`
      );
      return undefined;
    }

    return [...usernames][0];
  }

  /**
   * Get all collected users
   */
  getCollectedUsers(): ReadonlyMap<string, User> {
    return this.collectedUsers;
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
  getUser(username: string): User | undefined {
    return this.collectedUsers.get(username);
  }

  /**
   * Clear all collected data
   */
  clear(): void {
    this.collectedUsers.clear();
    this.userNameMappings.clear();
  }

  // Private helper methods
  private mergeUsers(existing: User, newUser: User): User {
    // Use logic similar to getFinalUser in destinations/airbyte-faros-destination
    const finalUser: Partial<User> = {};
    for (const user of [existing, newUser]) {
      for (const key in user) {
        if (!finalUser[key] && user[key]) {
          finalUser[key] = user[key];
        }
      }
    }
    return finalUser as User;
  }
}
