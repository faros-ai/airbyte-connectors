import {
  AirbyteMessageType,
  AirbyteRecord,
  parseAirbyteMessage,
} from 'faros-airbyte-cdk';
import * as fs from 'fs';
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

// Executes the destination write command in dry-run mode and optionally checks:
// - The processed and written records count
// - The records data
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

  // Setup file streams if output directory is specified
  const streams = outputDir
    ? (() => {
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, {recursive: true});
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const stdout = fs.createWriteStream(
          path.join(outputDir, `stdout-${timestamp}.log`)
        );
        const stderr = fs.createWriteStream(
          path.join(outputDir, `stderr-${timestamp}.log`)
        );
        return {stdout, stderr, timestamp};
      })()
    : null;

  // Run CLI command
  const cli = await CLI.runWith([
    'write',
    '--config',
    configPath,
    '--catalog',
    catalogPath,
    '--dry-run',
  ]);

  // Setup streams and process input
  if (streams) {
    cli.stdout.pipe(streams.stdout);
    cli.stderr.pipe(streams.stderr);
  }
  cli.stdin.end(readTestResourceFile(inputRecordsPath), 'utf8');

  // Process output
  const stdoutLines = await readLines(cli.stdout);
  const matches = stdoutLines
    .map((line) => {
      const regexes = [
        /Processed (\d+) records/,
        /Would write (\d+) records/,
        /Errored (\d+) records/,
        /Skipped (\d+) records/,
        /Processed records by stream: {(.*)}/,
        /Would write records by model: {(.*)}/,
      ];
      const match = regexes.find((regex) => regex.test(line));
      return match ? match.exec(line)[0] : null;
    })
    .filter(Boolean);

  expect(matches).toMatchSnapshot();

  // Process record data if needed
  if (checkRecordsData) {
    checkRecordsData(readRecordData(stdoutLines));
  }

  // Cleanup and verify
  if (streams) {
    streams.stdout.end();
    streams.stderr.end();
    console.log(
      `Test output written to:\n  ${path.join(outputDir, `stdout-${streams.timestamp}.log`)}\n  ${path.join(outputDir, `stderr-${streams.timestamp}.log`)}`
    );
  }

  expect(await read(cli.stderr)).toBe('');
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
