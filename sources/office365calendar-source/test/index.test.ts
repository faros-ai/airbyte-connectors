import * as fs from 'fs-extra';
import * as path from 'path';

describe('O365CAL-001: Project Setup and Structure', () => {
  const projectRoot = path.join(__dirname, '..');

  describe('Directory Structure', () => {
    test('should have required directory structure', () => {
      const requiredDirs = [
        'src',
        'src/streams',
        'resources',
        'resources/schemas',
        'test',
        'test_files',
        'bin'
      ];

      requiredDirs.forEach(dir => {
        const dirPath = path.join(projectRoot, dir);
        expect(fs.existsSync(dirPath)).toBe(true);
        expect(fs.statSync(dirPath).isDirectory()).toBe(true);
      });
    });

    test('should have source files in correct locations', () => {
      const requiredFiles = [
        'src/index.ts',
        'src/streams/index.ts',
        'src/tsconfig.json',
        'test/tsconfig.json',
        'bin/main'
      ];

      requiredFiles.forEach(file => {
        const filePath = path.join(projectRoot, file);
        expect(fs.existsSync(filePath)).toBe(true);
      });
    });
  });

  describe('Package Configuration', () => {
    let packageJson: any;

    beforeAll(() => {
      const packagePath = path.join(projectRoot, 'package.json');
      packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    });

    test('should have correct package name', () => {
      expect(packageJson.name).toBe('office365calendar-source');
    });

    test('should have correct description', () => {
      expect(packageJson.description).toBe('Office 365 Calendar Airbyte source');
    });

    test('should have correct keywords', () => {
      const expectedKeywords = ['airbyte', 'source', 'faros', 'microsoft', 'office365', 'o365', 'calendar'];
      expectedKeywords.forEach(keyword => {
        expect(packageJson.keywords).toContain(keyword);
      });
      
      // Should NOT have Google-related keywords
      const googleKeywords = ['google', 'googlecalendar', 'gcal'];
      googleKeywords.forEach(keyword => {
        expect(packageJson.keywords).not.toContain(keyword);
      });
    });

    test('should have correct dependencies', () => {
      // Required dependencies
      expect(packageJson.dependencies).toHaveProperty('@azure/msal-node');
      expect(packageJson.dependencies).toHaveProperty('@microsoft/microsoft-graph-client');
      expect(packageJson.dependencies).toHaveProperty('faros-airbyte-cdk');
      expect(packageJson.dependencies).toHaveProperty('verror');
      
      // Should NOT have Google dependencies
      expect(packageJson.dependencies).not.toHaveProperty('googleapis');
    });

    test('should have correct scripts', () => {
      const requiredScripts = ['build', 'clean', 'fix', 'lint', 'test', 'test-cov', 'watch'];
      requiredScripts.forEach(script => {
        expect(packageJson.scripts).toHaveProperty(script);
      });
    });

    test('should have Jest configuration', () => {
      expect(packageJson.jest).toBeDefined();
      expect(packageJson.jest.preset).toBe('ts-jest');
      expect(packageJson.jest.testEnvironment).toBe('node');
      expect(packageJson.jest.coverageDirectory).toBe('out/coverage');
    });
  });

  describe('TypeScript Configuration', () => {
    test('should have valid src/tsconfig.json', () => {
      const tsconfigPath = path.join(projectRoot, 'src/tsconfig.json');
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
      
      expect(tsconfig.extends).toBe('../../../.tsconfig.json');
      expect(tsconfig.compilerOptions.composite).toBe(true);
      expect(tsconfig.compilerOptions.outDir).toBe('../lib');
    });

    test('should have valid test/tsconfig.json', () => {
      const tsconfigPath = path.join(projectRoot, 'test/tsconfig.json');
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
      
      expect(tsconfig.extends).toBe('../../../.tsconfig.json');
      expect(tsconfig.compilerOptions.outDir).toBe('../out/test');
      expect(tsconfig.references).toContainEqual({ path: '../src' });
    });
  });

  describe('CLI Entry Point', () => {
    test('should have executable bin/main', () => {
      const binPath = path.join(projectRoot, 'bin/main');
      const stats = fs.statSync(binPath);
      
      // Check if file exists
      expect(stats.isFile()).toBe(true);
      
      // Check if executable (Unix)
      if (process.platform !== 'win32') {
        // eslint-disable-next-line no-bitwise
        expect(stats.mode & 0o111).toBeTruthy(); // Has execute permission
      }
    });

    test('should have correct shebang in bin/main', () => {
      const binPath = path.join(projectRoot, 'bin/main');
      const content = fs.readFileSync(binPath, 'utf8');
      
      expect(content.startsWith('#!/usr/bin/env node')).toBe(true);
    });
  });

  describe('Build Configuration', () => {
    test('should have TypeScript source files that can be compiled', () => {
      const sourceFiles = [
        'src/index.ts',
        'src/models.ts',
        'src/office365calendar.ts',
        'src/streams/index.ts'
      ];

      sourceFiles.forEach(file => {
        const filePath = path.join(projectRoot, file);
        expect(fs.existsSync(filePath)).toBe(true);
      });
    });

    test('should export mainCommand function from source', () => {
      const indexPath = path.join(projectRoot, 'src/index.ts');
      const indexContent = fs.readFileSync(indexPath, 'utf8');
      
      expect(indexContent).toContain('export function mainCommand');
      expect(indexContent).toContain('mainCommand()');
    });
  });

  describe('Project Standards Compliance', () => {
    test('should follow repository patterns', () => {
      // Compare with Google Calendar connector structure
      const googleCalendarPath = path.resolve(projectRoot, '../googlecalendar-source');
      
      if (fs.existsSync(googleCalendarPath)) {
        const googleDirs = fs.readdirSync(googleCalendarPath)
          .filter(item => fs.statSync(path.join(googleCalendarPath, item)).isDirectory())
          .filter(dir => !dir.startsWith('.') && dir !== 'node_modules');
        
        const ourDirs = fs.readdirSync(projectRoot)
          .filter(item => fs.statSync(path.join(projectRoot, item)).isDirectory())
          .filter(dir => !dir.startsWith('.') && dir !== 'node_modules' && dir !== 'out' && dir !== 'coverage');
        
        // Should have same directory structure
        expect(ourDirs.sort()).toEqual(googleDirs.sort());
      }
    });
  });
});