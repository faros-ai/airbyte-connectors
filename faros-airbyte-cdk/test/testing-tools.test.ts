import fs from 'fs';
import {
  readTestResourceFile,
  readTestResourceAsJSON,
  readResourceFile,
  readResourceAsJSON,
} from '../src/testing-tools';

jest.mock('fs');

describe('testing-tools', () => {
  const mockFileContent = 'test content';
  const mockJsonContent = '{"key": "value"}';

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.readFileSync as jest.Mock).mockImplementation((path) => {
      if (path.includes('json')) {
        return mockJsonContent;
      }
      return mockFileContent;
    });
  });

  describe('readTestResourceFile', () => {
    it('should use provided basePath if specified', () => {
      const result = readTestResourceFile('test.txt', 'custom/path');
      expect(fs.readFileSync).toHaveBeenCalledWith('custom/path/test.txt', 'utf8');
      expect(result).toBe(mockFileContent);
    });

    it('should try different paths if basePath is not specified', () => {
      (fs.readFileSync as jest.Mock).mockImplementationOnce(() => {
        throw new Error('File not found');
      });

      const result = readTestResourceFile('test.txt');
      
      expect(fs.readFileSync).toHaveBeenNthCalledWith(1, 'test/resources/test.txt', 'utf8');
      expect(fs.readFileSync).toHaveBeenNthCalledWith(2, 'test_files/test.txt', 'utf8');
      expect(result).toBe(mockFileContent);
    });

    it('should throw if no file is found', () => {
      (fs.readFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('File not found');
      });

      expect(() => readTestResourceFile('nonexistent.txt')).toThrow('Unable to find resource file');
    });
  });

  describe('readTestResourceAsJSON', () => {
    it('should parse JSON from the file content', () => {
      const result = readTestResourceAsJSON('test.json');
      expect(result).toEqual({ key: 'value' });
    });
  });

  describe('readResourceFile', () => {
    it('should read from resources/ directory', () => {
      const result = readResourceFile('test.txt');
      expect(fs.readFileSync).toHaveBeenCalledWith('resources/test.txt', 'utf8');
      expect(result).toBe(mockFileContent);
    });
  });

  describe('readResourceAsJSON', () => {
    it('should parse JSON from the resources directory', () => {
      const result = readResourceAsJSON('test.json');
      expect(fs.readFileSync).toHaveBeenCalledWith('resources/test.json', 'utf8');
      expect(result).toEqual({ key: 'value' });
    });
  });
});
