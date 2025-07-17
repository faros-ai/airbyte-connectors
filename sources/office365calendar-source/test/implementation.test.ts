import { mainCommand } from '../src';

describe('O365CAL-001: Implementation Tests', () => {
  describe('mainCommand function', () => {
    let consoleLogSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    test('should be exported from index.ts', () => {
      expect(mainCommand).toBeDefined();
      expect(typeof mainCommand).toBe('function');
    });

    test('should create main command without errors', () => {
      expect(() => mainCommand()).not.toThrow();
    });

    test('should return Command object', () => {
      const result = mainCommand();
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      expect(result.constructor.name).toBe('Command');
    });
  });

  describe('TypeScript Compilation', () => {
    test('should compile without errors', () => {
      // This test passes if the file compiles and can be imported
      expect(() => require('../src/index')).not.toThrow();
    });

    test('should generate proper type declarations', () => {
      // Type declaration file should exist
      const fs = require('fs');
      const path = require('path');
      const declPath = path.join(__dirname, '../lib/index.d.ts');
      
      expect(fs.existsSync(declPath)).toBe(true);
      
      const declContent = fs.readFileSync(declPath, 'utf8');
      expect(declContent).toContain('export declare function mainCommand(): Command;');
    });
  });
});