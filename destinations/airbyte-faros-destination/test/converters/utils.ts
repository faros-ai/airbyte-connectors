import {
  AirbyteLog,
  AirbyteLogLevel,
  AirbyteMessageType,
  AirbyteRecord,
  parseAirbyteMessage,
} from 'faros-airbyte-cdk';
import _ from 'lodash';
import {Dictionary} from 'ts-essentials';

import {CLI, read, readLines} from '../cli';

export interface DestinationWriteTestOptions {
  configPath: string;
  catalogPath: string;
  streamsLog: string;
  streamNamePrefix: string;
  expectedProcessedByStream?: Dictionary<number>;
  expectedWrittenByModel?: Dictionary<number>;
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
    expectedProcessedByStream,
    expectedWrittenByModel,
    streamsLog,
    streamNamePrefix,
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

  cli.stdin.end(streamsLog, 'utf8');

  const stdoutLines = await readLines(cli.stdout);

  if (expectedProcessedByStream && expectedWrittenByModel) {
    const stdout = stdoutLines.join('');

    const processed = _(expectedProcessedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const processedTotal = _(expectedProcessedByStream).values().sum();
    const writtenTotal = _(expectedWrittenByModel).values().sum();
    expect(stdout).toMatch(`Processed ${processedTotal} records`);
    expect(stdout).toMatch(`Would write ${writtenTotal} records`);
    expect(stdout).toMatch('Errored 0 records');
    expect(stdout).toMatch('Skipped 0 records');
    expect(stdout).toMatch(
      JSON.stringify(
        AirbyteLog.make(
          AirbyteLogLevel.INFO,
          `Processed records by stream: ${JSON.stringify(processed)}`
        )
      )
    );
    expect(stdout).toMatch(
      JSON.stringify(
        AirbyteLog.make(
          AirbyteLogLevel.INFO,
          `Would write records by model: ${JSON.stringify(expectedWrittenByModel)}`
        )
      )
    );
  }

  if (checkRecordsData) {
    const records = await readRecordData(stdoutLines);
    checkRecordsData(records);
  }

  expect(await read(cli.stderr)).toBe('');
  expect(await cli.wait()).toBe(0);
};

export async function readRecordData(
  lines: ReadonlyArray<string>
): Promise<ReadonlyArray<Dictionary<any>>> {
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
