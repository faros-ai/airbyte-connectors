import {FarosMergeRequests} from '../../src/streams/faros_merge_requests';
import {GitLabConfig} from '../../src/types';

describe('FarosMergeRequests', () => {
  it('should have no dependencies', () => {
    const mockConfig = {} as GitLabConfig;
    const mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    const mergeRequestsStream = new FarosMergeRequests(mockConfig, mockLogger);

    expect(mergeRequestsStream.dependencies).toEqual([]);
  });

  it('should have correct stream name', () => {
    const mockConfig = {} as GitLabConfig;
    const mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    const mergeRequestsStream = new FarosMergeRequests(mockConfig, mockLogger);

    expect(mergeRequestsStream.name).toBe('faros_merge_requests');
  });
});