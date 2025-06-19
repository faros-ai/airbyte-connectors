import {AirbyteLogger} from 'faros-airbyte-cdk';

import {UserCollector} from '../src/user-collector';
import {GitLabUserResponse} from '../src/user-collector';

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
      const user: GitLabUserResponse = {
        username: 'testuser',
        name: 'Test User',
        email: 'test@example.com',
        state: 'active',
        web_url: 'https://gitlab.com/testuser',
      };

      userCollector.collectUser(user);

      expect(userCollector.getUserCount()).toBe(1);
      expect(userCollector.hasUser('testuser')).toBe(true);
      expect(userCollector.getUser('testuser')).toMatchObject({
        __brand: 'FarosUser',
        username: 'testuser',
        name: 'Test User',
        email: 'test@example.com',
        state: 'active',
        web_url: 'https://gitlab.com/testuser',
      });
    });

    it('should skip users without a username', () => {
      const invalidUser = {
        name: 'Test User',
      } as any;

      userCollector.collectUser(invalidUser);

      expect(userCollector.getUserCount()).toBe(0);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `User has no username. Skipping collection. ${JSON.stringify(invalidUser)}`,
      );
    });

    it('should merge user data when collecting the same user twice', () => {
      const user1: GitLabUserResponse = {
        username: 'testuser',
        name: 'Test User',
        state: 'active',
        web_url: 'https://gitlab.com/testuser',
      };

      const user2: GitLabUserResponse = {
        username: 'testuser',
        email: 'test@example.com',
        state: 'active',
        web_url: 'https://gitlab.com/testuser',
      };

      userCollector.collectUser(user1);
      userCollector.collectUser(user2);

      expect(userCollector.getUserCount()).toBe(1);
      const mergedUser = userCollector.getUser('testuser');
      expect(mergedUser).toMatchObject({
        __brand: 'FarosUser',
        username: 'testuser',
        name: 'Test User',
        email: 'test@example.com',
        state: 'active',
        web_url: 'https://gitlab.com/testuser',
      });
    });

    it('should maintain name mappings for users', () => {
      const user1: GitLabUserResponse = {
        username: 'user1',
        name: 'John Doe',
        state: 'active',
        web_url: 'https://gitlab.com/user1',
      };

      const user2: GitLabUserResponse = {
        username: 'user2',
        name: 'John Doe',
        state: 'active',
        web_url: 'https://gitlab.com/user2',
      };

      userCollector.collectUser(user1);
      userCollector.collectUser(user2);

      // Should not return author when multiple users have the same name
      const author = userCollector.getCommitAuthor('John Doe', 'commit123');
      expect(author).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('maps to multiple usernames: user1, user2'),
      );
    });
  });

  describe('getCommitAuthor', () => {
    it('should return commit author for unique name mapping', () => {
      const user: GitLabUserResponse = {
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

      expect(author).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Failed to find a username for commit author "Unknown User" (commit: commit123)',
      );
    });

    it('should return undefined when multiple users have the same name', () => {
      const user1: GitLabUserResponse = {
        username: 'user1',
        name: 'John Doe',
        state: 'active',
        web_url: 'https://gitlab.com/user1',
      };

      const user2: GitLabUserResponse = {
        username: 'user2',
        name: 'John Doe',
        state: 'active',
        web_url: 'https://gitlab.com/user2',
      };

      userCollector.collectUser(user1);
      userCollector.collectUser(user2);

      const author = userCollector.getCommitAuthor('John Doe', 'commit123');

      expect(author).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Commit commit123 author name "John Doe" maps to multiple usernames: user1, user2. Will skip author association.',
      );
    });

    it('should handle users without names', () => {
      const user: GitLabUserResponse = {
        username: 'testuser',
        state: 'active',
        web_url: 'https://gitlab.com/testuser',
      };

      userCollector.collectUser(user);

      // Should not find author by name if user has no name
      const author = userCollector.getCommitAuthor('testuser', 'commit123');
      expect(author).toBeNull();
    });
  });

  describe('getCollectedUsers', () => {
    it('should return all collected users', () => {
      const user1: GitLabUserResponse = {
        username: 'user1',
        email: 'user1@example.com',
        name: 'User One',
        state: 'active',
        web_url: 'https://gitlab.com/user1',
      };

      const user2: GitLabUserResponse = {
        username: 'user2',
        email: 'user2@example.com',
        name: 'User Two',
        state: 'active',
        web_url: 'https://gitlab.com/user2',
      };

      userCollector.collectUser(user1);
      userCollector.collectUser(user2);

      const collectedUsers = userCollector.getCollectedUsers();
      expect(collectedUsers.size).toBe(2);
      expect(collectedUsers.get('user1')).toMatchObject({
        __brand: 'FarosUser',
        username: 'user1',
        name: 'User One',
        email: 'user1@example.com',
        state: 'active',
        web_url: 'https://gitlab.com/user1',
      });
      expect(collectedUsers.get('user2')).toMatchObject({
        __brand: 'FarosUser',
        username: 'user2',
        name: 'User Two',
        email: 'user2@example.com',
        state: 'active',
        web_url: 'https://gitlab.com/user2',
      });
    });
  });

  describe('clear', () => {
    it('should clear all collected data', () => {
      const user1: GitLabUserResponse = {
        username: 'user1',
        name: 'User One',
        state: 'active',
        web_url: 'https://gitlab.com/user1',
      };

      const user2: GitLabUserResponse = {
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
      expect(userCollector.getCommitAuthor('User One', 'commit123')).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle users with partial data', () => {
      const minimalUser: GitLabUserResponse = {
        username: 'testuser',
        state: 'active',
        web_url: 'https://gitlab.com/testuser',
      };

      userCollector.collectUser(minimalUser);

      expect(userCollector.getUserCount()).toBe(1);
      expect(userCollector.getUser('testuser')).toMatchObject({
        __brand: 'FarosUser',
        username: 'testuser',
        state: 'active',
        web_url: 'https://gitlab.com/testuser',
      });
    });

    it('should use first non-empty value when merging', () => {
      const user1: GitLabUserResponse = {
        username: 'testuser',
        name: 'Test User',
        state: 'active',
        web_url: 'https://gitlab.com/testuser',
      };

      const user2: GitLabUserResponse = {
        username: 'testuser',
        name: 'Test User',
        state: 'active',
        web_url: 'https://gitlab.com/testuser',
      };

      userCollector.collectUser(user1);
      userCollector.collectUser(user2);

      const mergedUser = userCollector.getUser('testuser');
      // First non-empty value wins
      expect(mergedUser?.web_url).toBe('https://gitlab.com/testuser');
    });
  });
});
