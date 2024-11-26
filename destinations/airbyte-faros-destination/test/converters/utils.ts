import {
  AirbyteMessageType,
  AirbyteRecord,
  parseAirbyteMessage,
} from 'faros-airbyte-cdk';
import {getLocal} from 'mockttp';
import {Dictionary} from 'ts-essentials';

import {CLI, read, readLines} from '../cli';
import {initMockttp, tempConfig} from '../testing-tools';
import {readTestResourceFile} from '../testing-tools';

export interface DestinationWriteTestOptions {
  configPath: string;
  catalogPath: string;
  inputRecordsPath: string;
  checkRecordsData?: (records: ReadonlyArray<Dictionary<any>>) => void;
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
  } = options;
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
  const matches: string[] = [];

  stdoutLines.forEach((line) => {
    const regexes = [
      /Processed (\d+) records/,
      /Would write (\d+) records/,
      /Errored (\d+) records/,
      /Skipped (\d+) records/,
      /Processed records by stream: {(.*)}/,
      /Would write records by model: {(.*)}/,
    ];

    const matchedLine = regexes.find((regex) => regex.test(line));
    if (matchedLine) {
      matches.push(matchedLine.exec(line)![0]);
    }
  });

  expect(matches).toMatchSnapshot();

  if (checkRecordsData) {
    const records = readRecordData(stdoutLines);
    checkRecordsData(records);
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
