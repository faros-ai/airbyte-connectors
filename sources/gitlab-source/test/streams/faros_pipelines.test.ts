import {FarosPipelines} from '../../src/streams/faros_pipelines';
import {GitLabConfig} from '../../src/types';

describe('FarosPipelines', () => {
  it('should have correct stream name', () => {
    const mockConfig = {} as GitLabConfig;
    const mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    const pipelinesStream = new FarosPipelines(mockConfig, mockLogger);

    expect(pipelinesStream.name).toBe('faros_pipelines');
  });

  it('should have correct primary key', () => {
    const mockConfig = {} as GitLabConfig;
    const mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    const pipelinesStream = new FarosPipelines(mockConfig, mockLogger);

    expect(pipelinesStream.primaryKey).toBe('id');
  });

  it('should have correct cursor field', () => {
    const mockConfig = {} as GitLabConfig;
    const mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    const pipelinesStream = new FarosPipelines(mockConfig, mockLogger);

    expect(pipelinesStream.cursorField).toBe('updated_at');
  });

  it('should load correct JSON schema', () => {
    const mockConfig = {} as GitLabConfig;
    const mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    const pipelinesStream = new FarosPipelines(mockConfig, mockLogger);

    expect(pipelinesStream.getJsonSchema()).toBeDefined();
    expect(typeof pipelinesStream.getJsonSchema()).toBe('object');
  });
});