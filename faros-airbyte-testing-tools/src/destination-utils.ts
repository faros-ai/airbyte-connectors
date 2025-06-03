import {
  AirbyteMessageType,
  AirbyteRecord,
  parseAirbyteMessage,
} from 'faros-airbyte-cdk';
import * as fs from 'fs';
import {create} from 'lodash';
import {getLocal} from 'mockttp';
import * as path from 'path';
import {Dictionary} from 'ts-essentials';

import {CLI, read, readLines} from './cli';
import {initMockttp, tempConfig} from './destination-testing-tools';
import {readTestResourceFile} from './testing-tools';

export interface DestinationWriteTestOptions {
  configPath: string;
  catalogPath: string;
  inputRecordsPath: string;
  checkRecordsData?: (records: ReadonlyArray<Dictionary<any>>) => void;
  // Write CLI output to files in this directory
  outputDir?: string | null;
}

export interface GenerateBasicTestSuiteOptions {
  sourceName: string;
  catalogPath?: string;
  inputRecordsPath?: string;
  checkRecordsData?: (records: ReadonlyArray<Dictionary<any>>) => void;
}

function createLogOutputFiles(outputDir: string): {
  stdoutPath: string;
  stderrPath: string;
} {
  if (fs.existsSync(outputDir)) {
    const stat = fs.statSync(outputDir);
    if (!stat.isDirectory()) {
      throw new Error(`${outputDir} exists and is not a directory`);
    }
  } else {
    try {
      fs.mkdirSync(outputDir, {recursive: true});
    } catch (error) {
      throw new Error(`Failed to create output directory: ${error}`);
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const stdoutPath = path.join(outputDir, `stdout-${timestamp}.log`);
  const stderrPath = path.join(outputDir, `stderr-${timestamp}.log`);

  try {
    // Simulate "touch" to test writability
    fs.closeSync(fs.openSync(stdoutPath, 'w'));
    fs.closeSync(fs.openSync(stderrPath, 'w'));
  } catch (error) {
    throw new Error(
      `Failed to verify writability of log files:\n  ${stdoutPath}\n  ${stderrPath}\nError: ${error}`
    );
  }

  return {stdoutPath, stderrPath};
}

function extractMatchLines(lines: readonly string[]): string[] {
  const regexes = [
    /Processed (\d+) records/,
    /Would write (\d+) records/,
    /Errored (\d+) records/,
    /Skipped (\d+) records/,
    /Processed records by stream: {(.*)}/,
    /Would write records by model: {(.*)}/,
  ];

  return lines
    .map((line) => {
      const regex = regexes.find((r) => r.test(line));
      return regex ? (regex.exec(line)?.[0] ?? null) : null;
    })
    .filter((line): line is string => line !== null);
}

// Executes the destination write command in dry-run mode and optionally checks:
// - The processed and written records count
// - The records data
// - Optionally writes the CLI output to files in a given output directory for debugging
export const destinationWriteTest = async (
  options: DestinationWriteTestOptions
): Promise<void> => {
  const {
    configPath,
    catalogPath,
    inputRecordsPath,
    checkRecordsData = undefined,
    outputDir = null,
  } = options;

  const logOutputFiles = outputDir ? createLogOutputFiles(outputDir) : null;
  if (!catalogPath || !inputRecordsPath) {
    throw new Error('catalogPath and inputRecordsPath are required.');
  }
  const cli = await CLI.runWith([
    'write',
    '--config',
    configPath,
    '--catalog',
    catalogPath,
    '--dry-run',
  ]);

  cli.stdin.end(readTestResourceFile(inputRecordsPath), 'utf8');

  const stdoutLines = await readLines(cli.stdout);
  const stderrLines = await readLines(cli.stderr);
  const matchedLines = extractMatchLines(stdoutLines);
  expect(matchedLines).toMatchSnapshot();

  if (checkRecordsData) {
    checkRecordsData(readRecordData(stdoutLines));
  }

  if (logOutputFiles) {
    fs.writeFileSync(logOutputFiles.stdoutPath, stdoutLines.join('\n'));
    fs.writeFileSync(logOutputFiles.stderrPath, stderrLines.join('\n'));
    console.log(
      `Test output written to:\n  ${logOutputFiles.stdoutPath}\n  ${logOutputFiles.stderrPath}`
    );
  }

  expect(stderrLines.join('\n')).toBe('');
  expect(await cli.wait()).toBe(0);
};

function readRecordData(
  lines: ReadonlyArray<string>
): ReadonlyArray<Dictionary<any>> {
  const records: Dictionary<any>[] = [];
  for (const line of lines) {
    try {
      const msg = parseAirbyteMessage(line);
      if (msg.type === AirbyteMessageType.RECORD) {
        const recordMessage = msg as AirbyteRecord;
        records.push(recordMessage.record.data);
      }
    } catch (error) {
      // Not a record message. Ignore.
    }
  }
  return records;
}

export function generateBasicTestSuite({
  sourceName,
  catalogPath = `test/resources/${sourceName}/catalog.json`,
  inputRecordsPath = `${sourceName}/all-streams.log`,
  checkRecordsData,
}: GenerateBasicTestSuiteOptions): void {
  describe(`${sourceName} basic test`, () => {
    const mockttp = getLocal({debug: false, recordTraffic: false});
    let configPath;

    beforeEach(async () => {
      await initMockttp(mockttp);
      configPath = await tempConfig({
        api_url: mockttp.url,
        log_records: !!checkRecordsData,
      });
    });

    afterEach(async () => {
      await mockttp.stop();
    });

    test('process records from all streams', async () => {
      await destinationWriteTest({
        configPath,
        catalogPath,
        inputRecordsPath,
        checkRecordsData,
      });
    });
  });
}
