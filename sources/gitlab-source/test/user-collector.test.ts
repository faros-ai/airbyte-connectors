import {AirbyteLogger} from 'faros-airbyte-cdk';
import {User} from 'faros-airbyte-common/gitlab';

import {UserCollector} from '../src/user-collector';

describe('UserCollector', () => {
  let userCollector: UserCollector;
  let mockLogger: AirbyteLogger;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;
    userCollector = new UserCollector(mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('collectUser', () => {
    it('should collect a valid user', () => {
      const user: User = {
        id: 1,
        username: 'testuser',
        name: 'Test User',
        email: 'test@example.com',
        state: 'active',
        web_url: 'https://gitlab.com/testuser',
        group_id: 'group1',
      };

      userCollector.collectUser(user);

      expect(userCollector.getUserCount()).toBe(1);
      expect(userCollector.hasUser('testuser')).toBe(true);
      expect(userCollector.getUser('testuser')).toEqual(user);
    });

    it('should skip users without a username', () => {
      const invalidUser = {
        id: 1,
        name: 'Test User',
      } as any;

      userCollector.collectUser(invalidUser);

      expect(userCollector.getUserCount()).toBe(0);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `User has no username. Skipping collection. ${JSON.stringify(invalidUser)}`
      );
    });

    it('should merge user data when collecting the same user twice', () => {
      const user1: User = {
        id: 1,
        username: 'testuser',
        name: 'Test User',
        state: 'active',
        web_url: 'https://gitlab.com/testuser',
      };

      const user2: User = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        state: 'active',
        web_url: 'https://gitlab.com/testuser',
      };

      userCollector.collectUser(user1);
      userCollector.collectUser(user2);

      expect(userCollector.getUserCount()).toBe(1);
      const mergedUser = userCollector.getUser('testuser');
      expect(mergedUser).toEqual({
        id: 1,
        username: 'testuser',
        name: 'Test User',
        email: 'test@example.com',
        state: 'active',
        web_url: 'https://gitlab.com/testuser',
      });
    });

    it('should maintain name mappings for users', () => {
      const user1: User = {
        id: 1,
        username: 'user1',
        name: 'John Doe',
        state: 'active',
        web_url: 'https://gitlab.com/user1',
      };

      const user2: User = {
        id: 2,
        username: 'user2',
        name: 'John Doe',
        state: 'active',
        web_url: 'https://gitlab.com/user2',
      };

      userCollector.collectUser(user1);
      userCollector.collectUser(user2);

      // Should not return author when multiple users have the same name
      const author = userCollector.getCommitAuthor('John Doe', 'commit123');
      expect(author).toBeUndefined();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('maps to multiple usernames: user1, user2')
      );
    });
  });

  describe('getCommitAuthor', () => {
    it('should return commit author for unique name mapping', () => {
      const user: User = {
        id: 1,
        username: 'testuser',
        name: 'Test User',
        state: 'active',
        web_url: 'https://gitlab.com/testuser',
      };

      userCollector.collectUser(user);
      const author = userCollector.getCommitAuthor('Test User', 'commit123');

      expect(author).toBe('testuser');
    });

    it('should return undefined for unknown author name', () => {
      const author = userCollector.getCommitAuthor('Unknown User', 'commit123');

      expect(author).toBeUndefined();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Failed to find a username for commit author "Unknown User" (commit: commit123)'
      );
    });

    it('should return undefined when multiple users have the same name', () => {
      const user1: User = {
        id: 1,
        username: 'user1',
        name: 'John Doe',
        state: 'active',
        web_url: 'https://gitlab.com/user1',
      };

      const user2: User = {
        id: 2,
        username: 'user2',
        name: 'John Doe',
        state: 'active',
        web_url: 'https://gitlab.com/user2',
      };

      userCollector.collectUser(user1);
      userCollector.collectUser(user2);

      const author = userCollector.getCommitAuthor('John Doe', 'commit123');

      expect(author).toBeUndefined();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Commit commit123 author name "John Doe" maps to multiple usernames: user1, user2. Will skip author association.'
      );
    });

    it('should handle users without names', () => {
      const user: User = {
        id: 1,
        username: 'testuser',
        state: 'active',
        web_url: 'https://gitlab.com/testuser',
      };

      userCollector.collectUser(user);

      // Should not find author by name if user has no name
      const author = userCollector.getCommitAuthor('testuser', 'commit123');
      expect(author).toBeUndefined();
    });
  });

  describe('getCollectedUsers', () => {
    it('should return all collected users', () => {
      const user1: User = {
        id: 1,
        username: 'user1',
        name: 'User One',
        state: 'active',
        web_url: 'https://gitlab.com/user1',
      };

      const user2: User = {
        id: 2,
        username: 'user2',
        name: 'User Two',
        state: 'active',
        web_url: 'https://gitlab.com/user2',
      };

      userCollector.collectUser(user1);
      userCollector.collectUser(user2);

      const collectedUsers = userCollector.getCollectedUsers();
      expect(collectedUsers.size).toBe(2);
      expect(collectedUsers.get('user1')).toEqual(user1);
      expect(collectedUsers.get('user2')).toEqual(user2);
    });
  });

  describe('clear', () => {
    it('should clear all collected data', () => {
      const user1: User = {
        id: 1,
        username: 'user1',
        name: 'User One',
        state: 'active',
        web_url: 'https://gitlab.com/user1',
      };

      const user2: User = {
        id: 2,
        username: 'user2',
        name: 'User Two',
        state: 'active',
        web_url: 'https://gitlab.com/user2',
      };

      userCollector.collectUser(user1);
      userCollector.collectUser(user2);

      expect(userCollector.getUserCount()).toBe(2);

      userCollector.clear();

      expect(userCollector.getUserCount()).toBe(0);
      expect(userCollector.hasUser('user1')).toBe(false);
      expect(userCollector.hasUser('user2')).toBe(false);
      expect(
        userCollector.getCommitAuthor('User One', 'commit123')
      ).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle users with partial data', () => {
      const minimalUser: User = {
        id: 1,
        username: 'testuser',
        state: 'active',
        web_url: 'https://gitlab.com/testuser',
      };

      userCollector.collectUser(minimalUser);

      expect(userCollector.getUserCount()).toBe(1);
      expect(userCollector.getUser('testuser')).toEqual(minimalUser);
    });

    it('should use first non-empty value when merging', () => {
      const user1: User = {
        id: 1,
        username: 'testuser',
        name: 'Test User',
        state: 'active',
        web_url: 'https://gitlab.com/testuser',
        updated_at: '2023-01-01T00:00:00Z',
      };

      const user2: User = {
        id: 1,
        username: 'testuser',
        name: 'Test User',
        state: 'active',
        web_url: 'https://gitlab.com/testuser',
        updated_at: '2023-01-02T00:00:00Z',
      };

      userCollector.collectUser(user1);
      userCollector.collectUser(user2);

      const mergedUser = userCollector.getUser('testuser');
      // First non-empty value wins
      expect(mergedUser?.updated_at).toBe('2023-01-01T00:00:00Z');
    });
  });
});
