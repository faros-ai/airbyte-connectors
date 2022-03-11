import {Command} from 'commander';

import {FarosDestinationRunner} from './destination-runner';

/** The main entry point. */
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

export {
  Converter,
  DestinationRecord,
  DestinationModel,
  StreamContext,
} from './converters/converter';
export {FarosDestinationRunner} from './destination-runner';
