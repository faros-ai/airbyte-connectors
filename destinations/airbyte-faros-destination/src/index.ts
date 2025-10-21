import {Command} from 'commander';

import {FarosDestinationRunner} from './destination-runner';

/**
 * The main entry point
 *
 * You can optionally provide options `exitOverride` and `configureOutput` to
 * override default behavior of the CLI when it detects an error and where it
 * writes to respectively. See https://github.com/tj/commander.js#override-exit-and-output-handling
 * for detailed info on how these options work.
 */
export function mainCommand(options?: {
  exitOverride?: boolean;
  suppressOutput?: boolean;
}): Command {
  const destinationRunner = new FarosDestinationRunner();
  const program = destinationRunner.mainCommand();

  if (options?.exitOverride) {
    program.exitOverride();
  }
  if (options?.suppressOutput) {
    program.configureOutput({
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      writeOut: () => {},
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      writeErr: () => {},
    });
  }

  return program;
}

export {Edition, FLUSH, InvalidRecordStrategy} from './common/types';
export {
  Converter,
  DestinationRecord,
  DestinationModel,
  StreamContext,
  StreamName,
} from './converters/converter';
export {FarosDestinationRunner} from './destination-runner';
