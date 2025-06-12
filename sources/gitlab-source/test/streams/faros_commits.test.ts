import {FarosCommits} from '../../src/streams/faros_commits';
import {GitLabConfig} from '../../src/types';

describe('FarosCommits', () => {
  it('should declare dependency on faros_users stream', () => {
    const mockConfig = {} as GitLabConfig;
    const mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    const commitsStream = new FarosCommits(mockConfig, mockLogger);

    expect(commitsStream.dependencies).toEqual(['faros_users']);
  });

  it('should have correct stream name', () => {
    const mockConfig = {} as GitLabConfig;
    const mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    const commitsStream = new FarosCommits(mockConfig, mockLogger);

    expect(commitsStream.name).toBe('faros_commits');
  });
});
