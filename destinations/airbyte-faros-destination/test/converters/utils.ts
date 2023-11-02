import {AirbyteLog, AirbyteLogLevel} from 'faros-airbyte-cdk';
import _ from 'lodash';
import {Dictionary} from 'ts-essentials';

import {CLI, read} from '../cli';

export type ProcessedAndWrittenModels = {
  processedTotal: number;
  writtenTotal: number;
};
/** Function to assert records written and processed from stream */
export async function assertProcessedAndWrittenModels<T>(
  processedByStream: Dictionary<number>,
  writtenByModel: Dictionary<number>,
  stdout: string,
  processed: Dictionary<T>,
  cli: CLI
): Promise<ProcessedAndWrittenModels> {
  const processedTotal = _(processedByStream).values().sum();
  const writtenTotal = _(writtenByModel).values().sum();
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
        `Would write records by model: ${JSON.stringify(writtenByModel)}`
      )
    )
  );
  expect(await read(cli.stderr)).toBe('');
  expect(await cli.wait()).toBe(0);
  return {processedTotal, writtenTotal};
}
